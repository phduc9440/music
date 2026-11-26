package com.ptit.music_be.worker;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.utils.AppTime;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class StudioSessionCleanupJob {

    private final PracticeSessionRepository practiceSessionRepository;

    @Scheduled(cron = "0 */30 * * * *", zone = AppTime.ZONE_ID)
    @Transactional
    public void abandonExpiredSessions() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        practiceSessionRepository.abandonExpiredSessions(
                PracticeSessionStatus.IN_PROGRESS, PracticeSessionStatus.ABANDONED, now.minusHours(6), now);
    }
}
