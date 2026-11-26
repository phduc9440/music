package com.ptit.music_be.utils;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

class AppTimeTest {

    @Test
    void vietnamDayStartsAt17hUtcOfThePreviousDay() {
        assertThat(AppTime.startOfDayUtc(LocalDate.of(2026, 11, 25))).isEqualTo(LocalDateTime.of(2026, 11, 24, 17, 0));
    }

    @Test
    void utcTimesAfter17hBelongToTheNextVietnamDay() {
        // phiên 22:54 giờ VN được lưu 15:54 UTC: vẫn là ngày 25/11
        assertThat(AppTime.localDateOf(LocalDateTime.of(2026, 11, 25, 15, 54))).isEqualTo(LocalDate.of(2026, 11, 25));
        // 17:30 UTC đã là 00:30 ngày hôm sau ở VN
        assertThat(AppTime.localDateOf(LocalDateTime.of(2026, 11, 25, 17, 30))).isEqualTo(LocalDate.of(2026, 11, 26));
    }

    @Test
    void jpqlLocalDateConvertsFromUtc() {
        assertThat(AppTime.localDate("s.startedAt"))
                .isEqualTo("cast(function('convert_tz', s.startedAt, '+00:00', '+07:00') as date)");
    }
}
