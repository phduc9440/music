package com.ptit.music_be.service.practice.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.practice.PracticeHeatmapDayResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PracticeStatsServiceImplTest {

    static final String EMAIL = "me@mail.com";

    @Mock
    PracticeSessionRepository sessions;

    @Mock
    MemberRepository members;

    PracticeStatsServiceImpl service;
    Member me;

    @BeforeEach
    void setUp() {
        service = new PracticeStatsServiceImpl(sessions, members);
        me = Member.builder().id("m-1").email(EMAIL).build();
        when(members.findByEmail(EMAIL)).thenReturn(Optional.of(me));
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(EMAIL, "x", "ROLE_USER"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static Object[] session(LocalDateTime startedAtUtc, long seconds) {
        return new Object[] {startedAtUtc, seconds};
    }

    @Test
    void heatmapGroupsByVietnamDayNotUtcDay() {
        // 25/11 18:30 UTC = 26/11 01:30 giờ Việt Nam; 25/11 03:00 UTC = 25/11 10:00 giờ Việt Nam
        when(sessions.sessionTimes(any(), any(), any(), anyInt()))
                .thenReturn(List.of(
                        session(LocalDateTime.of(2026, 11, 25, 3, 0), 600),
                        session(LocalDateTime.of(2026, 11, 25, 18, 30), 120),
                        session(LocalDateTime.of(2026, 11, 25, 19, 0), 60)));

        List<PracticeHeatmapDayResponse> days =
                service.getHeatmap(LocalDate.of(2026, 11, 25), LocalDate.of(2026, 11, 26));

        assertThat(days).extracting(PracticeHeatmapDayResponse::getDate)
                .containsExactly(LocalDate.of(2026, 11, 25), LocalDate.of(2026, 11, 26));
        assertThat(days.get(0).getSessionCount()).isEqualTo(1);
        assertThat(days.get(0).getTotalSeconds()).isEqualTo(600);
        assertThat(days.get(1).getSessionCount()).isEqualTo(2);
        assertThat(days.get(1).getTotalSeconds()).isEqualTo(180);
    }

    @Test
    void queryWindowStartsAtVietnamMidnightExpressedInUtc() {
        when(sessions.sessionTimes(any(), any(), any(), anyInt())).thenReturn(List.of());

        service.getHeatmap(LocalDate.of(2026, 11, 26), LocalDate.of(2026, 11, 26));

        // ngày 26 giờ Việt Nam = [25/11 17:00, 26/11 17:00) UTC
        verify(sessions)
                .sessionTimes(
                        eq(me),
                        eq(LocalDateTime.of(2026, 11, 25, 17, 0)),
                        eq(LocalDateTime.of(2026, 11, 26, 17, 0)),
                        anyInt());
    }
}
