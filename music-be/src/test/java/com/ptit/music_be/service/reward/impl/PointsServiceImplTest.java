package com.ptit.music_be.service.reward.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ptit.music_be.entity.PointsLedgerEntry;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.reward.PointsLedgerRepository;

/** X-02: sổ điểm cộng theo RewardReason, một lần cho mỗi (reason, refId), có giới hạn theo kỳ. */
@ExtendWith(MockitoExtension.class)
class PointsServiceImplTest {

    @Mock
    PointsLedgerRepository ledgerRepository;

    @Mock
    MemberRepository memberRepository;

    @InjectMocks
    PointsServiceImpl service;

    @Test
    void awardsPointsOfTheReason() {
        assertThat(service.award(new RewardEarnedEvent("m1", RewardReason.SCORE_OFFICIAL, "r1")))
                .isTrue();

        ArgumentCaptor<PointsLedgerEntry> saved = ArgumentCaptor.forClass(PointsLedgerEntry.class);
        verify(ledgerRepository).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getXp()).isEqualTo(100);
        assertThat(saved.getValue().getNotes()).isEqualTo(100);
        assertThat(saved.getValue().getMemberId()).isEqualTo("m1");
    }

    @Test
    void sameReasonAndRefIsAwardedOnce() {
        when(ledgerRepository.existsByReasonAndRefId(RewardReason.FIRST_DIGITIZED, "m1"))
                .thenReturn(true);

        assertThat(service.award(new RewardEarnedEvent("m1", RewardReason.FIRST_DIGITIZED, "m1")))
                .isFalse();
        verify(ledgerRepository, never()).saveAndFlush(any());
    }

    @Test
    void limitPerWindowIsApplied() {
        when(ledgerRepository.countByMemberIdAndReasonAndCreatedAtGreaterThanEqual(
                        eq("m1"), eq(RewardReason.SUGGESTION_ACCEPTED), any()))
                .thenReturn(10L);

        assertThat(service.award(new RewardEarnedEvent("m1", RewardReason.SUGGESTION_ACCEPTED, "s11")))
                .isFalse();
        verify(ledgerRepository, never()).saveAndFlush(any());
    }

    @Test
    void windowsStartOnLocalDayMondayAndFirstOfMonth() {
        LocalDate thursday = LocalDate.of(2026, 11, 26);
        // 00:00 giờ Việt Nam = 17:00 UTC hôm trước
        assertThat(PointsServiceImpl.windowStart(RewardReason.Window.DAY, thursday))
                .isEqualTo(LocalDateTime.of(2026, 11, 25, 17, 0));
        assertThat(PointsServiceImpl.windowStart(RewardReason.Window.WEEK, thursday))
                .isEqualTo(LocalDateTime.of(2026, 11, 22, 17, 0));
        assertThat(PointsServiceImpl.windowStart(RewardReason.Window.MONTH, thursday))
                .isEqualTo(LocalDateTime.of(2026, 10, 31, 17, 0));
        assertThat(PointsServiceImpl.windowStart(RewardReason.Window.NONE, thursday)).isNull();
    }
}
