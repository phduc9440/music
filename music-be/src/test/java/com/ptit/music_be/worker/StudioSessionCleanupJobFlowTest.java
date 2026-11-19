package com.ptit.music_be.worker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.practice.PracticeMode;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.repository.score.ScoreRepository;

/**
 * Job dọn buổi luyện treo trên MySQL thật: buổi IN_PROGRESS bắt đầu (giờ UTC, như StudioSessionServiceImpl ghi) quá 6 giờ
 * thì thành ABANDONED, chưa quá thì giữ nguyên. Kiểm chứng việc so sánh giờ UTC của job khớp với cách ghi giờ của studio.
 */
@SpringBootTest
class StudioSessionCleanupJobFlowTest {

    @Autowired
    StudioSessionCleanupJob job;

    @Autowired
    PracticeSessionRepository sessions;

    @Autowired
    MemberRepository members;

    @Autowired
    ScoreRepository scores;

    private String oldId;
    private String freshId;

    private String insert(int memberIndex, LocalDateTime startedAtUtc) {
        return sessions.save(PracticeSession.builder()
                        .member(members.findAll().get(memberIndex))
                        .score(scores.findAll().getFirst())
                        .mode(PracticeMode.FREE_RUN)
                        .status(PracticeSessionStatus.IN_PROGRESS)
                        .startedAt(startedAtUtc)
                        .build())
                .getId();
    }

    @AfterEach
    void cleanUp() {
        if (oldId != null) sessions.deleteById(oldId);
        if (freshId != null) sessions.deleteById(freshId);
    }

    @Test
    void onlySessionsOlderThanSixHoursAreAbandoned() {
        // Mỗi thành viên chỉ có một buổi IN_PROGRESS (ràng buộc duy nhất), nên cần hai thành viên
        assumeTrue(members.findAll().size() >= 2 && !scores.findAll().isEmpty(), "cần DB đã seed");
        LocalDateTime nowUtc = LocalDateTime.now(ZoneOffset.UTC);
        oldId = insert(0, nowUtc.minusHours(7));
        freshId = insert(1, nowUtc.minusHours(5));

        job.abandonExpiredSessions();

        assertEquals(
                PracticeSessionStatus.ABANDONED,
                sessions.findById(oldId).orElseThrow().getStatus());
        assertEquals(
                PracticeSessionStatus.IN_PROGRESS,
                sessions.findById(freshId).orElseThrow().getStatus());
    }
}
