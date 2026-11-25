package com.ptit.music_be.service.score;

import com.ptit.music_be.dto.response.score.ReviewListResponse;

/** Nhận xét bản nhạc (chấm sao, bình luận). Xem và viết đều chỉ cần quyền xem (bản công khai ai đăng nhập cũng có). */
public interface ScoreReviewService {

    ReviewListResponse getReviews(String scoreId);

    /** Tạo hoặc sửa nhận xét của tôi (mỗi người một nhận xét). Cần ít nhất số sao hoặc bình luận. */
    ReviewListResponse saveMyReview(String scoreId, Integer rating, String comment);

    /** Xóa nhận xét: tác giả, chủ sở hữu bản nhạc hoặc ADMIN. */
    ReviewListResponse deleteReview(String scoreId, String reviewId);
}
