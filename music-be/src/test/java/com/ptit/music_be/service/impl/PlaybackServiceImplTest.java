package com.ptit.music_be.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.ViewCountResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreCounterRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.ScoreFileService;

@ExtendWith(MockitoExtension.class)
class PlaybackServiceImplTest {

    static final String SCORE_ID = "score-1";

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreCounterRepository scoreCounterRepository;

    @Mock
    ScoreFileService scoreFileService;

    PlaybackServiceImpl service;
    Score score;

    @BeforeEach
    void setUp() {
        service = new PlaybackServiceImpl(scoreRepository, scoreCounterRepository, scoreFileService);
        Member owner = new Member();
        owner.setEmail("owner@example.com");
        score = new Score();
        score.setId(SCORE_ID);
        score.setMember(owner);
        score.setVisibility("PUBLIC");
        loginAs("viewer@example.com");
        lenient().when(scoreRepository.findById(SCORE_ID)).thenReturn(Optional.of(score));
        lenient().when(scoreCounterRepository.findViewCount(SCORE_ID)).thenReturn(7L);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void loginAs(String email) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "n/a", "ROLE_USER"));
    }

    @Test
    void countsPublicViewOfAnotherMember() {
        ViewCountResponse response = service.recordView(SCORE_ID);

        assertThat(response.counted()).isTrue();
        assertThat(response.viewCount()).isEqualTo(7L);
        verify(scoreCounterRepository).incrementViewCount(SCORE_ID);
    }

    @Test
    void countsOnlyOncePerWindowForTheSameMember() {
        service.recordView(SCORE_ID);
        ViewCountResponse second = service.recordView(SCORE_ID);

        assertThat(second.counted()).isFalse();
        verify(scoreCounterRepository, times(1)).incrementViewCount(SCORE_ID);
    }

    @Test
    void countsDifferentMembersSeparately() {
        service.recordView(SCORE_ID);
        loginAs("other@example.com");
        service.recordView(SCORE_ID);

        verify(scoreCounterRepository, times(2)).incrementViewCount(SCORE_ID);
    }

    @Test
    void doesNotCountOwnerViews() {
        loginAs("owner@example.com");

        assertThat(service.recordView(SCORE_ID).counted()).isFalse();
        verify(scoreCounterRepository, never()).incrementViewCount(anyString());
    }

    @Test
    void doesNotCountPrivateScores() {
        score.setVisibility("PRIVATE");

        assertThat(service.recordView(SCORE_ID).counted()).isFalse();
        verify(scoreCounterRepository, never()).incrementViewCount(anyString());
    }

    @Test
    void rejectsUnknownScore() {
        when(scoreRepository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.recordView("missing"))
                .isInstanceOfSatisfying(
                        AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SCORE_NOT_EXISTED));
    }
}
