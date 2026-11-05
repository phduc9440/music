package com.ptit.music_be.service;

import java.util.List;

import com.ptit.music_be.dto.request.ScoreUpdateRequest;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.ScoreDetailResponse;
import com.ptit.music_be.dto.response.ScoreSummaryResponse;

/** Quản lý bản nhạc: danh sách, chi tiết, sửa thông tin, xóa. */
public interface ScoreService {

    /**
     * Danh sách bản nhạc của người đang đăng nhập.
     *
     * @param page    trang, bắt đầu từ 0
     * @param size    số bản ghi mỗi trang (1..50)
     * @param keyword tìm theo tên hoặc tác giả (có thể rỗng)
     * @param status  lọc theo ProcessingStatus (rỗng = tất cả)
     * @param source  lọc theo ScoreSource (rỗng = tất cả)
     * @param difficulty lọc theo DifficultyLevel (rỗng = tất cả)
     * @param tagId lọc theo id thể loại (rỗng = tất cả)
     * @param sort    newest (mặc định) | oldest | title
     */
    PageResponse<ScoreSummaryResponse> getMyScores(
            int page, int size, String keyword, String status, String source, String difficulty, String tagId, String sort);

    ScoreDetailResponse getScore(String scoreId);

    ScoreDetailResponse updateScore(String scoreId, ScoreUpdateRequest request);

    void deleteScore(String scoreId);

    /**
     * Thay toàn bộ thể loại (tag) của bản nhạc bằng danh sách mới (tối đa 10, rỗng = gỡ hết). Cần quyền sửa bản nhạc.
     */
    ScoreDetailResponse updateTags(String scoreId, List<String> tagIds);
}
