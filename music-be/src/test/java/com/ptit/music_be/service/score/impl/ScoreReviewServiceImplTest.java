package com.ptit.music_be.service.score.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.response.score.ReviewListResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreReview;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreReviewRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.score.ScoreFileService;

/**
 * Nhận xét (đánh giá sao) chỉ người viết xóa được; chủ bản nhạc hay người được chia sẻ không xóa được nhận xét của người
 * khác (tránh xóa nhận xét chê). Người kiểm duyệt (SCORES_MODERATE) vẫn xóa được để gỡ nội dung vi phạm.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScoreReviewServiceImplTest {

    static final String SCORE_ID = "score-1";

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreReviewRepository reviewRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    ScoreFileService scoreFileService;

    @Mock
    NotificationService notificationService;

    @InjectMocks
    ScoreReviewServiceImpl service;

    Score score;
    Member owner;
    Member writer;
    ScoreReview review;

    @BeforeEach
    void setUp() {
        owner = Member.builder().id("m-owner").email("owner@x.com").build();
        writer = Member.builder().id("m-writer").email("writer@x.com").build();
        score = Score.builder().id(SCORE_ID).member(owner).build();
        review = ScoreReview.builder()
                .id("rv-1")
                .score(score)
                .member(writer)
                .rating(1)
                .comment("Chưa hay")
                .build();
        when(scoreRepository.findById(SCORE_ID)).thenReturn(Optional.of(score));
        when(reviewRepository.findById("rv-1")).thenReturn(Optional.of(review));
        when(reviewRepository.findByScoreIdFetchMember(SCORE_ID)).thenReturn(List.of(review));
        when(reviewRepository.getRatingStats(SCORE_ID)).thenReturn(new ScoreReviewRepository.RatingStats() {
            public Double getAverage() {
                return 1.0;
            }

            public Long getRatingCount() {
                return 1L;
            }
        });
        // Chủ bản nhạc quản lý được chia sẻ, nhưng điều đó không cho quyền xóa nhận xét của người khác
        when(scoreFileService.canManageSharing(score)).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void as(String email, String role) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", role));
    }

    @Test
    void scoreOwnerCannotDeleteSomeoneElsesReview() {
        as("owner@x.com", "ROLE_USER");

        AppException e = catchThrowableOfType(AppException.class, () -> service.deleteReview(SCORE_ID, "rv-1"));

        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
        verify(reviewRepository, never()).delete(any());
    }

    @Test
    void scoreOwnerDoesNotSeeDeleteOnOthersReviews() {
        as("owner@x.com", "ROLE_USER");

        ReviewListResponse list = service.getReviews(SCORE_ID);

        assertThat(list.getReviews()).singleElement().satisfies(r -> assertThat(r.isCanDelete())
                .isFalse());
    }

    @Test
    void writerCanDeleteOwnReview() {
        as("writer@x.com", "ROLE_USER");

        service.deleteReview(SCORE_ID, "rv-1");

        verify(reviewRepository).delete(review);
    }

    @Test
    void moderatorCanStillRemoveAReview() {
        as("mod@x.com", "ROLE_SUPER_ADMIN");

        service.deleteReview(SCORE_ID, "rv-1");

        verify(reviewRepository).delete(review);
    }
}
