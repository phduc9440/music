package com.ptit.music_be.utils;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class BusinessTimeTest {

    @Test
    void businessZoneIsVietnamByDefault() {
        assertThat(BusinessTime.ZONE.getId()).isEqualTo("Asia/Ho_Chi_Minh");
    }

    @Test
    void sessionAtOneThirtyAmVietnamBelongsToThatVietnamDay() {
        // 18:30 UTC ngày 25 = 01:30 sáng ngày 26 ở Việt Nam
        assertThat(BusinessTime.dayOf(LocalDateTime.of(2026, 11, 25, 18, 30))).isEqualTo(LocalDate.of(2026, 11, 26));
        assertThat(BusinessTime.dayOf(LocalDateTime.of(2026, 11, 25, 16, 59))).isEqualTo(LocalDate.of(2026, 11, 25));
    }

    @Test
    void startOfBusinessDayIsSeventeenHundredUtcOfThePreviousDay() {
        assertThat(BusinessTime.startOfDayUtc(LocalDate.of(2026, 11, 26)))
                .isEqualTo(LocalDateTime.of(2026, 11, 25, 17, 0));
    }

    @Test
    void todayFollowsTheBusinessZoneNotUtc() {
        Clock lateEveningUtc = Clock.fixed(Instant.parse("2026-11-25T20:00:00Z"), ZoneOffset.UTC);
        assertThat(BusinessTime.today(lateEveningUtc)).isEqualTo(LocalDate.of(2026, 11, 26));
    }
}
