package com.ptit.music_be.service.score.impl;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.response.score.ReviewListResponse;
import com.ptit.music_be.dto.response.score.ReviewResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreReview;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.CollabErrorCode;
import com.ptit.music_be.exception.code.ScoreErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.score.ScoreReviewRepository;
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
            throw new AppException(CollabErrorCode.REVIEW_EMPTY);
        }

        Member me = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(AccountErrorCode.USER_NOT_EXISTED));
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
                .orElseThrow(() -> new AppException(CollabErrorCode.REVIEW_NOT_EXISTED));
        if (!canDelete(review)) {
            throw new AppException(AccountErrorCode.UNAUTHORIZED);
        }
        reviewRepository.delete(review);
        reviewRepository.flush();
        return toResponse(score);
    }

    // ------------------------------------------------------------------ helpers

    private Score findScore(String scoreId) {
        return scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ScoreErrorCode.SCORE_NOT_EXISTED));
    }

    private boolean isMine(ScoreReview review) {
        return review.getMember().getEmail().equals(SecurityUtils.getCurrentEmail());
    }

    /**
     * Chỉ người viết xóa được nhận xét của mình; chủ bản nhạc hay người được chia sẻ không xóa được nhận xét của người khác
     * (tránh xóa nhận xét chê / chấm sao thấp). Người kiểm duyệt (SCORES_MODERATE) vẫn xóa được để gỡ nội dung vi phạm.
     */
    private boolean canDelete(ScoreReview review) {
        return isMine(review) || SecurityUtils.hasPermission(AdminPermission.SCORES_MODERATE);
    }

    private ReviewListResponse toResponse(Score score) {
        boolean admin = SecurityUtils.isAdmin();
        List<ReviewResponse> reviews = reviewRepository.findByScoreIdFetchMember(score.getId()).stream()
                .map(r -> ReviewResponse.builder()
                        .id(r.getId())
                        .memberId(r.getMember().getId())
                        // N-05: email người viết chỉ cho chính họ và quản trị viên; người khác thấy tên hiển thị
                        .email(admin || isMine(r) ? r.getMember().getEmail() : null)
                        .fullName(ScoreServiceImpl.displayNameOf(r.getMember()))
                        .rating(r.getRating())
                        .comment(r.getComment())
                        .mine(isMine(r))
                        .canDelete(canDelete(r))
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
