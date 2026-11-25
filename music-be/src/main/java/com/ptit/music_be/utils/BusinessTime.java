package com.ptit.music_be.utils;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * Giờ nghiệp vụ của hệ thống (X-06). Mọi thời điểm trong DB và JVM đều là UTC (xem {@code MusicBeApplication}), còn "ngày"
 * mà người dùng thấy (hôm nay, chuỗi ngày luyện tập, ngày diễn) tính theo múi giờ này, mặc định Việt Nam. Đổi bằng biến
 * môi trường {@code APP_ZONE} (ví dụ {@code Asia/Bangkok}).
 */
public final class BusinessTime {

    public static final ZoneId ZONE = zone();

    private BusinessTime() {}

    private static ZoneId zone() {
        String configured = System.getenv("APP_ZONE");
        try {
            return ZoneId.of(configured == null || configured.isBlank() ? "Asia/Ho_Chi_Minh" : configured.strip());
        } catch (RuntimeException e) {
            return ZoneId.of("Asia/Ho_Chi_Minh"); // tên múi giờ sai: dùng mặc định thay vì không khởi động được
        }
    }

    /** Hôm nay theo giờ nghiệp vụ (khác {@code LocalDate.now()} chạy theo múi giờ của máy chủ, thường là UTC). */
    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    public static LocalDate today(Clock clock) {
        return LocalDate.now(clock.withZone(ZONE));
    }

    /**
     * 00:00 của {@code day} theo giờ nghiệp vụ, đổi sang {@link LocalDateTime} UTC (cách DB lưu) để dùng làm mốc so
     * sánh với các cột thời gian.
     */
    public static LocalDateTime startOfDayUtc(LocalDate day) {
        return day.atStartOfDay(ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    /** Ngày (theo giờ nghiệp vụ) của một thời điểm UTC đã lưu trong DB. */
    public static LocalDate dayOf(LocalDateTime utc) {
        return utc.atOffset(ZoneOffset.UTC).atZoneSameInstant(ZONE).toLocalDate();
    }
}
