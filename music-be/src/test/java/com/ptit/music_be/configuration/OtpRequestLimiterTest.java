package com.ptit.music_be.configuration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;

class OtpRequestLimiterTest {

    private final AtomicLong now = new AtomicLong(1_000_000);
    private final OtpRequestLimiter limiter = new OtpRequestLimiter(now::get);

    private long retryAfter(Runnable r) {
        AppException e = assertThrows(AppException.class, r::run);
        assertEquals(ErrorCode.OTP_REQUEST_TOO_SOON, e.getErrorCode());
        return (Long) ((Map<?, ?>) e.getPayload()).get("retryAfterSeconds");
    }

    @Test
    void secondRequestWithinOneMinuteIsRejectedWithWaitTime() {
        limiter.acquire("a@x.com");
        now.addAndGet(20_000);
        assertEquals(40, retryAfter(() -> limiter.acquire("A@X.com "))); // không phân biệt hoa thường, khoảng trắng
        now.addAndGet(40_000);
        assertDoesNotThrow(() -> limiter.acquire("a@x.com"));
    }

    @Test
    void atMostFivePerHour() {
        for (int i = 0; i < 5; i++) {
            limiter.acquire("a@x.com");
            now.addAndGet(61_000);
        }
        long wait = retryAfter(() -> limiter.acquire("a@x.com"));
        assertEquals(3600 - 5 * 61, wait);
        now.addAndGet(wait * 1000);
        assertDoesNotThrow(() -> limiter.acquire("a@x.com"));
    }

    @Test
    void emailsAreCountedSeparately() {
        limiter.acquire("a@x.com");
        assertDoesNotThrow(() -> limiter.acquire("b@x.com"));
    }

    @Test
    void rejectedRequestIsNotCounted() {
        limiter.acquire("a@x.com");
        now.addAndGet(10_000);
        retryAfter(() -> limiter.acquire("a@x.com"));
        now.addAndGet(50_000); // 60 giây kể từ lần được chấp nhận, không phải lần bị từ chối
        assertDoesNotThrow(() -> limiter.acquire("a@x.com"));
    }
}
