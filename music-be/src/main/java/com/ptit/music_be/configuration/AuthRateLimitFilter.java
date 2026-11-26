package com.ptit.music_be.configuration;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.jspecify.annotations.NonNull;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.fasterxml.jackson.databind.json.JsonMapper;
import com.ptit.music_be.dto.response.common.ApiResponse;

/**
 * In-memory sliding-window rate limiter for the public /api/auth endpoints, keyed by client IP + path.
 * Single-instance only; use a shared store (e.g. Redis) if the backend is scaled horizontally.
 * Note: the client IP is {@code getRemoteAddr()}; behind a reverse proxy configure
 * {@code server.forward-headers-strategy} so it reflects the real client.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MS = 60_000;
    private static final int DEFAULT_LIMIT = 10;
    private static final Map<String, Integer> LIMITS = Map.of(
            "/api/auth/refresh", 30,
            "/api/auth/change-password", 10);

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();
    private volatile long lastCleanup = System.currentTimeMillis();

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equalsIgnoreCase(request.getMethod())
                || !request.getRequestURI().startsWith("/api/auth/");
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        int limit = LIMITS.getOrDefault(path, DEFAULT_LIMIT);
        long now = System.currentTimeMillis();
        cleanup(now);

        Deque<Long> window = hits.computeIfAbsent(request.getRemoteAddr() + "|" + path, k -> new ArrayDeque<>());
        boolean allowed;
        long retryAfterSec = 1;
        synchronized (window) {
            while (!window.isEmpty() && now - window.peekFirst() > WINDOW_MS) {
                window.pollFirst();
            }
            allowed = window.size() < limit;
            if (allowed) {
                window.addLast(now);
            } else {
                retryAfterSec = Math.max(1, (WINDOW_MS - (now - window.peekFirst()) + 999) / 1000);
            }
        }

        if (!allowed) {
            response.setStatus(429);
            response.setHeader("Retry-After", String.valueOf(retryAfterSec));
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter()
                    .write(JsonMapper.builder()
                            .build()
                            .writeValueAsString(ApiResponse.builder()
                                    .code(1010)
                                    .message("Too many requests. Please try again later.")
                                    .build()));
            return;
        }
        chain.doFilter(request, response);
    }

    private void cleanup(long now) {
        if (now - lastCleanup < WINDOW_MS) return;
        lastCleanup = now;
        hits.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                Long last = e.getValue().peekLast();
                return last == null || now - last > WINDOW_MS;
            }
        });
    }
}
