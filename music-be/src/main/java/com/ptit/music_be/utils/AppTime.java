package com.ptit.music_be.utils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * Múi giờ nghiệp vụ (X-06). Mọi cột thời gian lưu giờ UTC (JVM đặt UTC ở {@code MusicBeApplication}); khi cần "hôm nay",
 * "chuỗi ngày", "gom theo ngày" hay chạy lịch thì tính theo giờ Việt Nam.
 *
 * <p>Việt Nam không đổi giờ mùa hè nên độ lệch cố định {@value #SQL_OFFSET}, dùng được ngay trong câu JPQL (hằng số).
 */
public final class AppTime {

    public static final String ZONE_ID = "Asia/Ho_Chi_Minh";
    public static final ZoneId ZONE = ZoneId.of(ZONE_ID);
    /** Độ lệch của {@link #ZONE} so với UTC, dạng MySQL CONVERT_TZ. */
    public static final String SQL_OFFSET = "+07:00";

    /**
     * Ngày theo giờ Việt Nam của một cột LocalDateTime (UTC) trong JPQL, ví dụ
     * {@code localDate("s.startedAt")} → {@code cast(function('convert_tz', s.startedAt, '+00:00', '+07:00') as date)}.
     */
    public static String localDate(String utcColumn) {
        return "cast(function('convert_tz', " + utcColumn + ", '+00:00', '" + SQL_OFFSET + "') as date)";
    }

    private AppTime() {}

    /** Hôm nay theo giờ Việt Nam. */
    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    /** Bây giờ theo UTC, cùng mốc với các cột thời gian trong DB. */
    public static LocalDateTime nowUtc() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }

    /** 0 giờ của một ngày theo giờ Việt Nam, đổi ra LocalDateTime UTC để so với cột trong DB. */
    public static LocalDateTime startOfDayUtc(LocalDate day) {
        return day.atStartOfDay(ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    /** Ngày theo giờ Việt Nam của một mốc UTC. */
    public static LocalDate localDateOf(LocalDateTime utc) {
        return utc.atOffset(ZoneOffset.UTC).atZoneSameInstant(ZONE).toLocalDate();
    }
}
