package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.practice.PracticeMode;
import com.ptit.music_be.dto.response.admin.AdminPracticeSessionResponse;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.admin.AdminPracticeService;

/**
 * Các câu truy vấn của trang quản lý luyện tập chạy trên MySQL thật (lọc, thống kê theo ngày, bất thường). Cần MySQL đã
 * chạy; buổi luyện tạo cho test bị xóa sau mỗi ca.
 */
@SpringBootTest
class AdminPracticeFlowTest {

    @Autowired
    AdminPracticeService practice;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    PracticeSessionRepository sessionRepository;

    @Autowired
    MemberRepository memberRepository;

    @Autowired
    ScoreRepository scoreRepository;

    private String sessionId;

    private static void loginAsSuperAdmin() {
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken("admin@music.com", "x", "ROLE_SUPER_ADMIN"));
    }

    @AfterEach
    void cleanUp() {
        if (sessionId != null) {
            jdbc.update("DELETE FROM practice_sessions WHERE id = ?", sessionId);
        }
        SecurityContextHolder.clearContext();
    }

    private void insertSession(
            PracticeSessionStatus status, Integer duration, Integer notes, Double accuracy, LocalDateTime startedAt) {
        var member = memberRepository.findAll().stream().findFirst();
        var score = scoreRepository.findAll().stream().findFirst();
        assumeTrue(member.isPresent() && score.isPresent(), "cần DB đã seed thành viên và bản nhạc");
        sessionId = sessionRepository
                .save(PracticeSession.builder()
                        .member(member.get())
                        .score(score.get())
                        .mode(PracticeMode.FREE)
                        .status(status)
                        .startedAt(startedAt)
                        .durationSeconds(duration)
                        .totalNotes(notes)
                        .accuracyPct(accuracy)
                        .build())
                .getId();
    }

    @Test
    void listAndOverviewQueriesRunWithEveryFilter() {
        loginAsSuperAdmin();
        LocalDate today = LocalDate.now();

        assertNotNull(practice.list(0, 10, null, null, null, false, null, null));
        assertNotNull(practice.list(0, 10, "a", "FREE", "COMPLETED", false, today.minusDays(30), today));
        assertNotNull(practice.list(0, 10, null, "FREE_RUN", "IN_PROGRESS", true, null, null));

        AdminPracticeSessionResponse.Overview overview = practice.overview(null, null);
        assertEquals(30, overview.getByDay().size());
        assertTrue(overview.getSessions() >= 0);
        assertThrows(AppException.class, () -> practice.overview(today.minusDays(500), today));
    }

    @Test
    void anomalousFilterFindsAShortCompletedSessionAndItCanBeDeleted() {
        loginAsSuperAdmin();
        insertSession(PracticeSessionStatus.COMPLETED, 3, 20, 0.0, LocalDateTime.now(ZoneOffset.UTC));

        var result = practice.list(0, 100, null, null, null, true, LocalDate.now(), LocalDate.now());
        var row = result.getContent().stream()
                .filter(s -> s.getId().equals(sessionId))
                .findFirst()
                .orElseThrow();
        assertTrue(row.getAnomalies().containsAll(List.of("SHORT", "ZERO_ACCURACY")));
        assertFalse(row.isCanClose());

        practice.delete(sessionId);
        assertEquals(
                0,
                jdbc.queryForObject("SELECT COUNT(*) FROM practice_sessions WHERE id = ?", Integer.class, sessionId));
    }

    @Test
    void stuckSessionCanBeClosedOnce() {
        loginAsSuperAdmin();
        insertSession(
                PracticeSessionStatus.IN_PROGRESS,
                null,
                null,
                null,
                LocalDateTime.now(ZoneOffset.UTC).minusHours(8));

        var stuck = practice.list(0, 100, null, null, "IN_PROGRESS", true, null, null).getContent().stream()
                .filter(s -> s.getId().equals(sessionId))
                .findFirst()
                .orElseThrow();
        assertEquals(List.of("STUCK"), stuck.getAnomalies());
        assertTrue(stuck.isCanClose());

        assertEquals("ABANDONED", practice.close(sessionId).getStatus());
        assertThrows(AppException.class, () -> practice.close(sessionId));
    }
}
