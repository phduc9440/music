package com.ptit.music_be.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.StudioHandMode;
import com.ptit.music_be.dto.enums.StudioInputSource;
import com.ptit.music_be.dto.enums.StudioMode;
import com.ptit.music_be.dto.enums.practice.PracticeMode;
import com.ptit.music_be.dto.request.StudioSessionCreateRequest;
import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.LibraryErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.StudioTimelineService;
import com.ptit.music_be.service.score.ScoreFileService;

@ExtendWith(MockitoExtension.class)
class StudioSessionServiceImplTest {

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

    StudioSessionServiceImpl service;

    final Member member =
            Member.builder().id("member-1").email("user@example.com").build();
    final Score score =
            Score.builder().id("score-1").title("Test score").measureCount(2).build();

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        UsernamePasswordAuthenticationToken.authenticated("user@example.com", null, List.of()));
        service = new StudioSessionServiceImpl(
                memberRepository, practiceSessionRepository, scoreRepository, scoreFileService, studioTimelineService);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createsSessionWithScorableNoteCountAndWireMode() {
        StudioTimelineResponse timeline = timeline();
        when(memberRepository.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(member));
        when(scoreRepository.findById("score-1")).thenReturn(Optional.of(score));
        when(scoreFileService.canView(score)).thenReturn(true);
        when(studioTimelineService.getTimeline("score-1")).thenReturn(timeline);
        when(practiceSessionRepository.findByMemberAndStatus(member, PracticeSessionStatus.IN_PROGRESS))
                .thenReturn(Optional.empty());
        when(practiceSessionRepository.save(any(PracticeSession.class))).thenAnswer(invocation -> {
            PracticeSession session = invocation.getArgument(0);
            session.setId("session-1");
            return session;
        });

        var response = service.createSession(request(null, null));

        assertThat(response.sessionId()).isEqualTo("session-1");
        assertThat(response.status()).isEqualTo(PracticeSessionStatus.IN_PROGRESS);
        assertThat(response.scorableNotesInRange()).isEqualTo(1);
        ArgumentCaptor<PracticeSession> saved = ArgumentCaptor.forClass(PracticeSession.class);
        verify(practiceSessionRepository).save(saved.capture());
        assertThat(saved.getValue().getMode()).isEqualTo(PracticeMode.WAIT);
        assertThat(saved.getValue().getTotalNotes()).isEqualTo(1);
    }

    @Test
    void rejectsLoopOutsideTimelineMeasureRange() {
        when(scoreRepository.findById("score-1")).thenReturn(Optional.of(score));
        when(scoreFileService.canView(score)).thenReturn(true);
        when(studioTimelineService.getTimeline("score-1")).thenReturn(timeline());

        assertThatThrownBy(() -> service.createSession(request(1, 3))).isInstanceOf(AppException.class);
    }

    @Test
    void rejectsAnotherSessionWhenMemberAlreadyHasOneActive() {
        PracticeSession activeSession =
                PracticeSession.builder().id("active-session").build();
        when(memberRepository.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(member));
        when(scoreRepository.findById("score-1")).thenReturn(Optional.of(score));
        when(scoreFileService.canView(score)).thenReturn(true);
        when(studioTimelineService.getTimeline("score-1")).thenReturn(timeline());
        when(practiceSessionRepository.findByMemberAndStatus(member, PracticeSessionStatus.IN_PROGRESS))
                .thenReturn(Optional.of(activeSession));

        assertThatThrownBy(() -> service.createSession(request(null, null)))
                .isInstanceOfSatisfying(AppException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(LibraryErrorCode.STUDIO_SESSION_ALREADY_ACTIVE);
                    assertThat(exception.getPayload()).isEqualTo(java.util.Map.of("activeSessionId", "active-session"));
                });
    }

    @Test
    void abortsOnlyAnActiveSessionOwnedByCurrentMember() {
        PracticeSession activeSession = PracticeSession.builder()
                .id("session-1")
                .member(member)
                .status(PracticeSessionStatus.IN_PROGRESS)
                .isCompleted(false)
                .build();
        when(memberRepository.findByEmailForUpdate("user@example.com")).thenReturn(Optional.of(member));
        when(practiceSessionRepository.findByIdAndMemberForUpdate("session-1", member))
                .thenReturn(Optional.of(activeSession));

        service.abortSession("session-1");

        assertThat(activeSession.getStatus()).isEqualTo(PracticeSessionStatus.ABANDONED);
        assertThat(activeSession.getEndedAt()).isNotNull();
        verify(practiceSessionRepository).save(activeSession);
    }

    private static StudioSessionCreateRequest request(Integer loopStart, Integer loopEnd) {
        return new StudioSessionCreateRequest(
                "score-1", StudioMode.WAIT, StudioInputSource.TOUCH, StudioHandMode.BOTH, 80, loopStart, loopEnd);
    }

    private static StudioTimelineResponse timeline() {
        return new StudioTimelineResponse(
                "score-1",
                "hash",
                "Test score",
                2,
                100,
                List.of(),
                List.of(),
                List.of(new StudioTimelineResponse.Measure(1, 0, 4, 1), new StudioTimelineResponse.Measure(2, 4, 4, 2)),
                List.of(
                        new StudioTimelineResponse.Note("n1", 1, 1, "RIGHT", 60, 0, 1, true, null, null),
                        new StudioTimelineResponse.Note("n2", 2, 1, "RIGHT", 62, 4, 1, false, null, null)),
                List.of(),
                List.of());
    }
}
