package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.LibraryErrorCode;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;

class AdminPracticeServiceImplTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 19, 12, 0);

    private final PracticeSessionRepository repository = mock(PracticeSessionRepository.class);
    private final AdminPracticeServiceImpl service = new AdminPracticeServiceImpl(null, repository);

    private PracticeSession session(PracticeSessionStatus status, Integer duration, Integer notes, Double accuracy) {
        return PracticeSession.builder()
                .status(status)
                .durationSeconds(duration)
                .totalNotes(notes)
                .accuracyPct(accuracy)
                .startedAt(NOW.minusMinutes(5))
                .build();
    }

    @Test
    void normalSessionHasNoAnomaly() {
        assertEquals(
                List.of(),
                AdminPracticeServiceImpl.anomalies(session(PracticeSessionStatus.COMPLETED, 300, 100, 80.0), NOW));
    }

    @Test
    void shortAbandonedSessionIsNotAnomalousButShortCompletedIs() {
        assertEquals(
                List.of(),
                AdminPracticeServiceImpl.anomalies(session(PracticeSessionStatus.ABANDONED, 3, 0, null), NOW));
        assertEquals(
                List.of("SHORT"),
                AdminPracticeServiceImpl.anomalies(session(PracticeSessionStatus.COMPLETED, 3, 0, null), NOW));
    }

    @Test
    void zeroAccuracyAndLongSessionsAreFlagged() {
        assertEquals(
                List.of("ZERO_ACCURACY"),
                AdminPracticeServiceImpl.anomalies(session(PracticeSessionStatus.COMPLETED, 200, 50, 0.0), NOW));
        assertEquals(
                List.of("LONG"),
                AdminPracticeServiceImpl.anomalies(session(PracticeSessionStatus.ABANDONED, 7 * 3600, 10, 50.0), NOW));
    }

    @Test
    void inProgressForTooLongIsStuck() {
        PracticeSession stuck = session(PracticeSessionStatus.IN_PROGRESS, null, null, null);
        stuck.setStartedAt(NOW.minusHours(7));
        assertEquals(List.of("STUCK"), AdminPracticeServiceImpl.anomalies(stuck, NOW));
        assertEquals(
                List.of(),
                AdminPracticeServiceImpl.anomalies(session(PracticeSessionStatus.IN_PROGRESS, null, null, null), NOW));
    }

    @Test
    void closeOnlyWorksOnInProgress() {
        PracticeSession done = session(PracticeSessionStatus.COMPLETED, 100, 10, 90.0);
        when(repository.findById("done")).thenReturn(Optional.of(done));
        assertEquals(
                LibraryErrorCode.STUDIO_SESSION_NOT_ACTIVE,
                assertThrows(AppException.class, () -> service.close("done")).getErrorCode());
    }

    @Test
    void deleteMissingSessionFails() {
        when(repository.findById("x")).thenReturn(Optional.empty());
        assertEquals(
                LibraryErrorCode.PRACTICE_SESSION_NOT_EXISTED,
                assertThrows(AppException.class, () -> service.delete("x")).getErrorCode());
    }
}
