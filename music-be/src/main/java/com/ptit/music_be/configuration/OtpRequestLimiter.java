package com.ptit.music_be.configuration;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

import org.springframework.stereotype.Component;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

/**
 * Giới hạn yêu cầu mã OTP quên mật khẩu theo từng email (bổ sung cho giới hạn theo IP của AuthRateLimitFilter): phải
 * cách nhau {@link #COOLDOWN_MS} và tối đa {@link #MAX_PER_HOUR} lần mỗi giờ. Áp cho mọi email nhập vào, kể cả email
 * không tồn tại, để phản hồi không làm lộ email nào đã đăng ký. Lưu trong bộ nhớ (chạy nhiều máy chủ thì mỗi máy đếm
 * riêng).
 */
@Component
public class OtpRequestLimiter {

    static final long COOLDOWN_MS = 60_000;
    static final long HOUR_MS = 3_600_000;
    static final int MAX_PER_HOUR = 5;

    private final Map<String, Deque<Long>> requests = new ConcurrentHashMap<>();
    private final LongSupplier clock;

    public OtpRequestLimiter() {
        this(System::currentTimeMillis);
    }

    /** Cho test truyền đồng hồ giả. */
    OtpRequestLimiter(LongSupplier clock) {
        this.clock = clock;
    }

    /**
     * Ghi nhận một lần yêu cầu mã cho email; quá giới hạn thì ném OTP_REQUEST_TOO_SOON kèm số giây cần chờ (trả trong
     * ApiResponse.result.retryAfterSeconds).
     */
    public void acquire(String email) {
        String key = email == null ? "" : email.trim().toLowerCase();
        long now = clock.getAsLong();
        Deque<Long> times = requests.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (times) {
            while (!times.isEmpty() && now - times.peekFirst() >= HOUR_MS) {
                times.pollFirst();
            }
            long waitMs = 0;
            if (!times.isEmpty() && now - times.peekLast() < COOLDOWN_MS) {
                waitMs = COOLDOWN_MS - (now - times.peekLast());
            }
            if (times.size() >= MAX_PER_HOUR) {
                waitMs = Math.max(waitMs, HOUR_MS - (now - times.peekFirst()));
            }
            if (waitMs > 0) {
                throw new AppException(
                        ErrorCode.OTP_REQUEST_TOO_SOON, Map.of("retryAfterSeconds", (waitMs + 999) / 1000));
            }
            times.addLast(now);
        }
        cleanup(now);
    }

    /** Dọn các email không còn lần yêu cầu nào trong giờ qua để map không phình mãi. */
    private void cleanup(long now) {
        if (requests.size() < 1000) {
            return;
        }
        requests.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                Long last = e.getValue().peekLast();
                return last == null || now - last >= HOUR_MS;
            }
        });
    }
}
