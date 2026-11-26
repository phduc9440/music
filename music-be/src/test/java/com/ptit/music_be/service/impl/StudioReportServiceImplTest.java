package com.ptit.music_be.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.practice.PracticeMode;
import com.ptit.music_be.dto.request.StudioSessionFinishRequest;
import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.StudioTimelineService;
import com.ptit.music_be.service.score.ScoreFileService;

@ExtendWith(MockitoExtension.class)
class StudioReportServiceImplTest {

    @Mock
    JdbcTemplate jdbcTemplate;

    @Mock
    MemberRepository memberRepository;

    @Mock
    PracticeSessionRepository practiceSessionRepository;

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreFileService scoreFileService;

    @Mock
    StudioTimelineService studioTimelineService;

    final Member member =
            Member.builder().id("member-1").email("user@example.com").build();
    final Score score = Score.builder().id("score-1").title("Test score").build();
    PracticeSession session;
    StudioReportServiceImpl service;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        UsernamePasswordAuthenticationToken.authenticated("user@example.com", null, List.of()));
        session = PracticeSession.builder()
                .id("session-1")
                .member(member)
                .score(score)
                .mode(PracticeMode.FREE_RUN)
                .status(PracticeSessionStatus.IN_PROGRESS)
                .tempoPercent(100.0)
                .totalNotes(2)
                .startedAt(LocalDateTime.of(2026, 11, 17, 0, 0))
                .build();
        service = new StudioReportServiceImpl(
                jdbcTemplate,
                memberRepository,
                practiceSessionRepository,
                scoreRepository,
                scoreFileService,
                studioTimelineService);
        org.mockito.Mockito.lenient()
                .when(studioTimelineService.getTimeline("score-1"))
                .thenReturn(timelineWithNotes(2));
        when(memberRepository.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(member));
        when(practiceSessionRepository.findByIdAndMemberForUpdate("session-1", member))
                .thenReturn(Optional.of(session));
        when(practiceSessionRepository.save(any(PracticeSession.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(practiceSessionRepository
                        .findFirstByMemberAndScoreAndModeInAndStatusAndStartedAtLessThanOrderByStartedAtDesc(
                                any(), any(), any(), any(), any()))
                .thenReturn(Optional.empty());
        when(practiceSessionRepository.findBestStudioScoreBefore(any(), any(), any(), any(), any()))
                .thenReturn(null);
        when(practiceSessionRepository.findBestStudioScore(any(), any(), any(), any()))
                .thenReturn(8500.0);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void finishAggregatesCountsAndBuildsMeasureAndComparisonReport() {
        mockEventRows("PERFECT", 1, "LATE", 1, new int[][] {{1, 0, 1}, {2, 2, 1}});

        var report = service.finishSession("session-1", new StudioSessionFinishRequest(30, true, 2500));

        assertThat(report.counts().total()).isEqualTo(2);
        assertThat(report.counts().perfect()).isEqualTo(1);
        assertThat(report.counts().late()).isEqualTo(1);
        assertThat(report.accuracyPct()).isEqualTo(100.0);
        assertThat(report.timingAccuracyPct()).isEqualTo(50.0);
        assertThat(report.scorePoints()).isEqualTo(8500);
        assertThat(report.grade()).isEqualTo("A");
        assertThat(report.measureBreakdown()).hasSize(2);
        assertThat(report.weakestMeasures()).containsExactly(2);
        assertThat(report.comparison().isNewBest()).isTrue();
        assertThat(session.getStatus()).isEqualTo(PracticeSessionStatus.COMPLETED);
        assertThat(session.getCoveredUntilMs()).isEqualTo(2500);
        assertThat(session.getIsCompleted()).isTrue();
    }

    @Test
    void waitModeOmitsTimingScoreAndScoresOnTheFullScale() {
        session.setMode(PracticeMode.WAIT);
        mockEventRows("PERFECT", 1, "EARLY", 1, new int[0][0]);

        var report = service.finishSession("session-1", new StudioSessionFinishRequest(30, false, 0));

        assertThat(report.accuracyPct()).isEqualTo(100.0);
        assertThat(report.timingAccuracyPct()).isNull();
        assertThat(report.scorePoints()).isEqualTo(10000);
        assertThat(report.isCompleted()).isFalse();
        // chưa tới cuối bài thì không lập kỷ lục
        assertThat(report.comparison().isNewBest()).isFalse();
    }

    @Test
    void stoppingEarlyCountsUnplayedNotesAsMissed() {
        session.setMode(PracticeMode.WAIT);
        when(studioTimelineService.getTimeline("score-1")).thenReturn(timelineWithNotes(8));
        mockEventRows("PERFECT", 2, "WRONG_PITCH", 1, new int[0][0]);

        var report = service.finishSession("session-1", new StudioSessionFinishRequest(10, false, 0));

        assertThat(report.counts().total()).isEqualTo(8);
        assertThat(report.counts().missed()).isEqualTo(6);
        assertThat(report.accuracyPct()).isEqualTo(25.0);
        assertThat(report.comparison().isNewBest()).isFalse();
        assertThat(session.getMissedCount()).isEqualTo(6);
    }

    private static StudioTimelineResponse timelineWithNotes(int count) {
        List<StudioTimelineResponse.Note> notes = new java.util.ArrayList<>();
        for (int index = 0; index < count; index++) {
            notes.add(new StudioTimelineResponse.Note("n" + index, 1, 1, null, 60, index, 1, true, null, null));
        }
        return new StudioTimelineResponse(
                "score-1", "h", "Test score", 1, 100, List.of(), List.of(), List.of(), notes, List.of(), List.of());
    }

    private void mockEventRows(
            String firstResult, int firstCount, String secondResult, int secondCount, int[][] measureRows) {
        doAnswer(invocation -> {
                    String sql = invocation.getArgument(0);
                    RowCallbackHandler callback = invocation.getArgument(1);
                    if (sql.contains("GROUP BY result")) {
                        process(callback, firstResult, firstCount);
                        process(callback, secondResult, secondCount);
                    } else if (sql.contains("GROUP BY measure, result")) {
                        for (int[] row : measureRows) {
                            ResultSet resultSet = org.mockito.Mockito.mock(ResultSet.class);
                            when(resultSet.getInt(1)).thenReturn(row[0]);
                            when(resultSet.getString(2)).thenReturn(resultName(row[1]));
                            when(resultSet.getInt(3)).thenReturn(row[2]);
                            callback.processRow(resultSet);
                        }
                    }
                    return null;
                })
                .when(jdbcTemplate)
                .query(anyString(), any(RowCallbackHandler.class), any(Object[].class));
    }

    private static void process(RowCallbackHandler callback, String result, int count) throws Exception {
        ResultSet resultSet = org.mockito.Mockito.mock(ResultSet.class);
        when(resultSet.getString(1)).thenReturn(result);
        when(resultSet.getInt(2)).thenReturn(count);
        callback.processRow(resultSet);
    }

    private static String resultName(int index) {
        return switch (index) {
            case 0 -> "PERFECT";
            case 1 -> "EARLY";
            case 2 -> "LATE";
            case 3 -> "WRONG_PITCH";
            case 4 -> "MISSED";
            default -> throw new IllegalArgumentException("Invalid result index");
        };
    }
}
