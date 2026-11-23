package com.ptit.music_be.websocket;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import com.ptit.music_be.configuration.MemberStatusGuard;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Các phiên WebSocket đang mở theo email. Dùng để ngắt phiên của tài khoản vừa bị khóa (không phải đợi tới lần kết nối
 * lại): job định kỳ hỏi {@link MemberStatusGuard}, nên chậm nhất khoảng {@code SWEEP_MILLIS} cộng thời gian nhớ của guard.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketSessions {

    static final long SWEEP_MILLIS = 15_000;

    private final MemberStatusGuard memberStatusGuard;
    private final ConcurrentHashMap<String, Set<WebSocketSession>> byEmail = new ConcurrentHashMap<>();

    void add(String email, WebSocketSession session) {
        byEmail.computeIfAbsent(email, k -> ConcurrentHashMap.newKeySet()).add(session);
    }

    void remove(String email, WebSocketSession session) {
        byEmail.computeIfPresent(email, (k, set) -> {
            set.remove(session);
            return set.isEmpty() ? null : set;
        });
    }

    /** Ngắt mọi phiên đang mở của một tài khoản. */
    public void disconnect(String email) {
        Set<WebSocketSession> sessions = byEmail.remove(email);
        if (sessions == null) {
            return;
        }
        for (WebSocketSession s : sessions) {
            try {
                s.close(CloseStatus.POLICY_VIOLATION.withReason("Account locked"));
            } catch (IOException e) {
                log.debug("Không đóng được phiên WebSocket của {}", email, e);
            }
        }
    }

    public int count() {
        return byEmail.values().stream().mapToInt(Set::size).sum();
    }

    @Scheduled(fixedDelay = SWEEP_MILLIS)
    void disconnectLocked() {
        for (String email : byEmail.keySet()) {
            if (memberStatusGuard.isLocked(email)) {
                disconnect(email);
            }
        }
    }
}
