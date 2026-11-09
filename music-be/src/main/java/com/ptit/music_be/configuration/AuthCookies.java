package com.ptit.music_be.configuration;

import java.time.Duration;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.response.AuthResponse;

/** Đọc/ghi cookie HttpOnly chứa access token và refresh token. */
@Component
public class AuthCookies {
    public static final String ACCESS = "access_token";
    public static final String REFRESH = "refresh_token";

    @Value("${jwt.valid-duration}")
    private long validHours;

    @Value("${jwt.refreshable-duration}")
    private long refreshableHours;

    /** Đặt true khi chạy HTTPS (production). */
    @Value("${app.auth.cookie-secure:false}")
    private boolean secure;

    @Value("${app.auth.cookie-same-site:Lax}")
    private String sameSite;

    public void write(HttpServletResponse response, AuthResponse auth) {
        add(response, build(ACCESS, auth.getToken(), "/", Duration.ofHours(validHours)));
        add(response, build(REFRESH, auth.getRefreshToken(), "/api/auth", Duration.ofHours(refreshableHours)));
    }

    public void clear(HttpServletResponse response) {
        add(response, build(ACCESS, "", "/", Duration.ZERO));
        add(response, build(REFRESH, "", "/api/auth", Duration.ZERO));
    }

    public static String read(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (name.equals(c.getName()) && !c.getValue().isBlank()) return c.getValue();
        }
        return null;
    }

    private ResponseCookie build(String name, String value, String path, Duration maxAge) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite(sameSite)
                .path(path)
                .maxAge(maxAge)
                .build();
    }

    private void add(HttpServletResponse response, ResponseCookie cookie) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
