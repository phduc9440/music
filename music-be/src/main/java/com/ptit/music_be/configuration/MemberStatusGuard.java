package com.ptit.music_be.configuration;

import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.repository.MemberRepository;

import lombok.RequiredArgsConstructor;

/**
 * Cho biết một tài khoản có đang bị khóa không, để chặn access token đã cấp trước khi khóa. Kết quả được nhớ ngắn
 * ({@link #TTL_MILLIS}) để không truy vấn DB ở mọi request; admin khóa/mở khóa thì gọi {@link #evict} nên có hiệu lực
 * ngay trên máy chủ này (chạy nhiều máy chủ thì chậm nhất sau TTL).
 */
@Component
@RequiredArgsConstructor
public class MemberStatusGuard {

    static final long TTL_MILLIS = 15_000;

    private record Entry(boolean locked, long expiresAt) {}

    private final MemberRepository memberRepository;
    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();

    public boolean isLocked(String email) {
        if (email == null) {
            return false;
        }
        long now = System.currentTimeMillis();
        Entry cached = cache.get(email);
        if (cached != null && cached.expiresAt() > now) {
            return cached.locked();
        }
        boolean locked = memberRepository
                .findStatusByEmail(email)
                .map(status -> status != MemberStatus.ACTIVE)
                .orElse(false); // không có tài khoản: để các lớp sau tự báo, không coi là bị khóa
        cache.put(email, new Entry(locked, now + TTL_MILLIS));
        return locked;
    }

    /** Xóa kết quả đã nhớ của một tài khoản (gọi khi trạng thái thay đổi). */
    public void evict(String email) {
        if (email != null) {
            cache.remove(email);
        }
    }
}
