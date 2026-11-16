package com.ptit.music_be.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.StudioNoteEventResult;
import com.ptit.music_be.dto.request.StudioEventBatchRequest;
import com.ptit.music_be.dto.request.StudioNoteEventRequest;
import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.service.StudioTimelineService;

@ExtendWith(MockitoExtension.class)
class StudioEventServiceImplTest {

    @Mock
    JdbcTemplate jdbcTemplate;

    @Mock
    MemberRepository memberRepository;

    @Mock
    PracticeSessionRepository practiceSessionRepository;

    @Mock
    StudioTimelineService studioTimelineService;

    StudioEventServiceImpl service;

    final Member member =
            Member.builder().id("member-1").email("user@example.com").build();
    final Score score = Score.builder().id("score-1").title("Test score").build();
    final PracticeSession session = PracticeSession.builder()
            .id("session-1")
            .member(member)
            .score(score)
            .status(PracticeSessionStatus.IN_PROGRESS)
            .build();

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        UsernamePasswordAuthenticationToken.authenticated("user@example.com", null, List.of()));
        service = new StudioEventServiceImpl(
                jdbcTemplate, memberRepository, practiceSessionRepository, studioTimelineService);
    }

    private void stubActiveSession() {
        when(memberRepository.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(member));
        when(practiceSessionRepository.findByIdAndMemberForUpdate("session-1", member))
                .thenReturn(Optional.of(session));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void storesNewEventsAndReturnsAcceptedCount() {
        stubActiveSession();
        when(studioTimelineService.getTimeline("score-1")).thenReturn(timeline());
        when(jdbcTemplate.queryForList(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbcTemplate.batchUpdate(anyString(), anyList())).thenReturn(new int[] {1, 1});
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);

        var response = service.ingestEvents("session-1", request(event(0, "n0001"), event(1, null)));

        assertThat(response.accepted()).isEqualTo(2);
        assertThat(response.duplicates()).isZero();
        assertThat(response.lastSeq()).isEqualTo(1);
        verify(jdbcTemplate).batchUpdate(anyString(), anyList());
    }

    @Test
    void retriesSkipAlreadyStoredSequenceNumbers() {
        stubActiveSession();
        when(studioTimelineService.getTimeline("score-1")).thenReturn(timeline());
        when(jdbcTemplate.queryForList(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(List.of(0));
        when(jdbcTemplate.batchUpdate(anyString(), anyList())).thenReturn(new int[] {1});
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);

        var response = service.ingestEvents("session-1", request(event(0, "n0001"), event(1, null)));

        assertThat(response.accepted()).isEqualTo(1);
        assertThat(response.duplicates()).isEqualTo(1);
        assertThat(response.lastSeq()).isEqualTo(1);
    }

    @Test
    void rejectsUnknownTimelineNoteId() {
        stubActiveSession();
        when(studioTimelineService.getTimeline("score-1")).thenReturn(timeline());

        assertThatThrownBy(() -> service.ingestEvents("session-1", request(event(0, "unknown"))))
                .isInstanceOfSatisfying(AppException.class, exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.STUDIO_EVENT_INVALID));
    }

    @Test
    void rejectsBatchesLargerThanTwoHundredBeforeDatabaseWork() {
        StudioNoteEventRequest event = event(0, null);
        List<StudioNoteEventRequest> events = java.util.Collections.nCopies(201, event);

        assertThatThrownBy(() -> service.ingestEvents("session-1", new StudioEventBatchRequest(events)))
                .isInstanceOfSatisfying(AppException.class, exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.STUDIO_EVENT_BATCH_TOO_LARGE));
    }

    @Test
    void rejectsEventsOutOfSequenceOrder() {
        stubActiveSession();
        assertThatThrownBy(() -> service.ingestEvents("session-1", request(event(2, null), event(1, null))))
                .isInstanceOfSatisfying(AppException.class, exception -> assertThat(exception.getErrorCode())
                        .isEqualTo(ErrorCode.STUDIO_EVENT_INVALID));
    }

    private static StudioEventBatchRequest request(StudioNoteEventRequest... events) {
        return new StudioEventBatchRequest(List.of(events));
    }

    private static StudioNoteEventRequest event(int seq, String noteId) {
        return new StudioNoteEventRequest(
                seq,
                noteId,
                1,
                noteId == null ? null : "RIGHT",
                noteId == null ? null : 60,
                60,
                noteId == null ? null : 0,
                -35,
                noteId == null ? null : -35,
                noteId == null ? StudioNoteEventResult.WRONG_PITCH : StudioNoteEventResult.EARLY);
    }

    private static StudioTimelineResponse timeline() {
        return new StudioTimelineResponse(
                "score-1",
                "hash",
                "Test score",
                1,
                100,
                List.of(),
                List.of(),
                List.of(new StudioTimelineResponse.Measure(1, 0, 4)),
                List.of(new StudioTimelineResponse.Note("n0001", 1, 1, "RIGHT", 60, 0, 1, true, null, null)),
                List.of(),
                List.of());
    }
}
