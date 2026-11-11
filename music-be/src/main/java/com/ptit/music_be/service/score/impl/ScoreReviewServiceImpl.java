package com.ptit.music_be.service.score.impl;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.response.ReviewListResponse;
import com.ptit.music_be.dto.response.ReviewResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreReview;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.repository.ScoreReviewRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.score.ScoreReviewService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScoreReviewServiceImpl implements ScoreReviewService {

    ScoreRepository scoreRepository;
    ScoreReviewRepository reviewRepository;
    MemberRepository memberRepository;
    ScoreFileService scoreFileService;
    NotificationService notificationService;

    @Override
    @Transactional(readOnly = true)
    public ReviewListResponse getReviews(String scoreId) {
        Score score = findScore(scoreId);
        scoreFileService.checkCanView(score);
        return toResponse(score);
    }

    @Override
    @Transactional
    public ReviewListResponse saveMyReview(String scoreId, Integer rating, String comment) {
        Score score = findScore(scoreId);
        scoreFileService.checkCanReview(score);

        String cleanComment = StringUtils.hasText(comment) ? comment.trim() : null;
        if (rating == null && cleanComment == null) {
            throw new AppException(ErrorCode.REVIEW_EMPTY);
        }

        Member me = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        ScoreReview review = reviewRepository
                .findByScoreIdAndMemberId(scoreId, me.getId())
                .orElseGet(() -> ScoreReview.builder().score(score).member(me).build());
        boolean isNew = review.getId() == null;
        review.setRating(rating);
        review.setComment(cleanComment);
        reviewRepository.save(review);
        if (isNew) { // sửa lại nhận xét cũ thì không báo thêm
            String who = me.getFullName() != null && !me.getFullName().isBlank() ? me.getFullName() : me.getEmail();
            notificationService.notify(
                    score.getMember(),
                    me,
                    NotificationType.NEW_REVIEW,
                    scoreId,
                    who + " đã nhận xét bản nhạc \"" + score.getTitle() + "\"",
                    NotificationService.params("name", who, "title", score.getTitle()));
        }
        reviewRepository.flush();
        return toResponse(score);
    }

    @Override
    @Transactional
    public ReviewListResponse deleteReview(String scoreId, String reviewId) {
        Score score = findScore(scoreId);
        scoreFileService.checkCanView(score);
        ScoreReview review = reviewRepository
                .findById(reviewId)
                .filter(r -> r.getScore().getId().equals(scoreId))
                .orElseThrow(() -> new AppException(ErrorCode.REVIEW_NOT_EXISTED));
        if (!canDelete(score, review)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        reviewRepository.delete(review);
        reviewRepository.flush();
        return toResponse(score);
    }

    // ------------------------------------------------------------------ helpers

    private Score findScore(String scoreId) {
        return scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
    }

    private boolean isMine(ScoreReview review) {
        return review.getMember().getEmail().equals(SecurityUtils.getCurrentEmail());
    }

    /** Tác giả nhận xét, chủ sở hữu bản nhạc hoặc ADMIN được xóa. */
    private boolean canDelete(Score score, ScoreReview review) {
        return isMine(review) || SecurityUtils.isAdmin() || scoreFileService.canManageSharing(score);
    }

    private ReviewListResponse toResponse(Score score) {
        List<ReviewResponse> reviews = reviewRepository.findByScoreIdFetchMember(score.getId()).stream()
                .map(r -> ReviewResponse.builder()
                        .id(r.getId())
                        .memberId(r.getMember().getId())
                        .email(r.getMember().getEmail())
                        .fullName(r.getMember().getFullName())
                        .rating(r.getRating())
                        .comment(r.getComment())
                        .mine(isMine(r))
                        .canDelete(canDelete(score, r))
                        .createdAt(r.getCreatedAt())
                        .updatedAt(r.getUpdatedAt())
                        .build())
                .toList();
        var stats = reviewRepository.getRatingStats(score.getId());
        Double average = stats.getAverage() == null
                ? null
                : BigDecimal.valueOf(stats.getAverage())
                        .setScale(1, RoundingMode.HALF_UP)
                        .doubleValue();
        return ReviewListResponse.builder()
                .averageRating(average)
                .ratingCount(stats.getRatingCount() == null ? 0 : stats.getRatingCount())
                .reviews(reviews)
                .build();
    }
}
