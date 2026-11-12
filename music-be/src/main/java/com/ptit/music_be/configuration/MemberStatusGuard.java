package com.ptit.music_be.configuration;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.repository.auth.MemberRepository;

import lombok.RequiredArgsConstructor;

/**
 * Quyết định một token đã cấp có còn dùng được không: tài khoản bị khóa, hoặc token được cấp trước lần đổi/đặt lại mật
 * khẩu gần nhất, thì từ chối. Kết quả được nhớ ngắn ({@link #TTL_MILLIS}) để không truy vấn DB ở mọi request; khi
 * khóa/mở khóa hay đổi mật khẩu thì gọi {@link #evict} nên có hiệu lực ngay trên máy chủ này (nhiều máy chủ thì chậm
 * nhất sau TTL).
 */
@Component
@RequiredArgsConstructor
public class MemberStatusGuard {

    static final long TTL_MILLIS = 15_000;

    /** passwordChangedAt tính bằng giây epoch (null nếu chưa từng đổi), cùng đơn vị với claim iat của JWT. */
    private record Entry(boolean locked, Long passwordChangedAt, long expiresAt) {}

    private final MemberRepository memberRepository;
    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();

    public boolean isLocked(String email) {
        Entry e = load(email);
        return e != null && e.locked();
    }

    /**
     * Token của email này, cấp lúc issuedAt, có bị từ chối không. Token không có iat thì coi như cũ (bị từ chối nếu đã
     * từng đổi mật khẩu). So sánh theo giây: token cấp trong cùng giây với lần đổi vẫn hợp lệ (token mới cấp ngay sau
     * khi đổi mật khẩu không bị chặn nhầm).
     */
    public boolean isRejected(String email, Instant issuedAt) {
        Entry e = load(email);
        if (e == null) {
            return false; // không có tài khoản: để các lớp sau tự báo
        }
        if (e.locked()) {
            return true;
        }
        if (e.passwordChangedAt() == null) {
            return false;
        }
        return issuedAt == null || issuedAt.getEpochSecond() < e.passwordChangedAt();
    }

    /** Xóa kết quả đã nhớ của một tài khoản (gọi khi trạng thái hoặc mật khẩu thay đổi). */
    public void evict(String email) {
        if (email != null) {
            cache.remove(email);
        }
    }

    private Entry load(String email) {
        if (email == null) {
            return null;
        }
        long now = System.currentTimeMillis();
        Entry cached = cache.get(email);
        if (cached != null && cached.expiresAt() > now) {
            return cached;
        }
        Entry fresh = memberRepository
                .findAuthStateByEmail(email)
                .map(s -> new Entry(
                        s.getStatus() != null && s.getStatus() != MemberStatus.ACTIVE,
                        toEpochSecond(s.getPasswordChangedAt()),
                        now + TTL_MILLIS))
                .orElse(null);
        if (fresh != null) {
            cache.put(email, fresh);
        }
        return fresh;
    }

    private static Long toEpochSecond(LocalDateTime time) {
        return time == null ? null : time.atZone(ZoneId.systemDefault()).toEpochSecond();
    }
}
