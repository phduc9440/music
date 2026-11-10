package com.ptit.music_be.service;

import com.ptit.music_be.dto.response.ReviewListResponse;

/** Nhận xét bản nhạc (chấm sao, bình luận). Xem cần quyền xem; viết cần quyền nhận xét trở lên. */
public interface ScoreReviewService {

    ReviewListResponse getReviews(String scoreId);

    /** Tạo hoặc sửa nhận xét của tôi (mỗi người một nhận xét). Cần ít nhất số sao hoặc bình luận. */
    ReviewListResponse saveMyReview(String scoreId, Integer rating, String comment);

    /** Xóa nhận xét: tác giả, chủ sở hữu bản nhạc hoặc ADMIN. */
    ReviewListResponse deleteReview(String scoreId, String reviewId);
}
