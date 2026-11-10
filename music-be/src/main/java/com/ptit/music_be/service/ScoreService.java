package com.ptit.music_be.service;

import java.util.List;

import com.ptit.music_be.dto.enums.Visibility;
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
            int page,
            int size,
            String keyword,
            String status,
            String source,
            String difficulty,
            String tagId,
            String sort);

    /** Bản nhạc người khác chia sẻ cho người đang đăng nhập (qua liên kết hoặc được mời/duyệt), kèm cấp quyền. */
    PageResponse<ScoreSummaryResponse> getSharedWithMe(int page, int size);

    ScoreDetailResponse getScore(String scoreId);

    ScoreDetailResponse updateScore(String scoreId, ScoreUpdateRequest request);

    /** Chuyển vào thùng rác, không ghi lý do. */
    void deleteScore(String scoreId);

    /**
     * Chuyển bản nhạc vào thùng rác (xóa mềm, giữ 30 ngày). Chủ sở hữu xóa bản của mình; ADMIN chỉ xóa để kiểm duyệt
     * bản đang PUBLIC / PENDING, {@code reason} là lý do gửi cho chủ.
     */
    void deleteScore(String scoreId, String reason);

    /** Kho score mẫu cho người mới học (mọi người đã đăng nhập xem được), từ dễ đến khó. */
    PageResponse<ScoreSummaryResponse> getOfficialScores(int page, int size, String keyword, String difficulty);

    /** ADMIN: bản nhạc công khai chưa nằm trong kho score mẫu, để chọn đưa vào. */
    PageResponse<ScoreSummaryResponse> getOfficialCandidates(int page, int size, String keyword);

    /** ADMIN: đưa một bản nhạc đã công khai vào kho score mẫu. */
    ScoreDetailResponse markOfficial(String scoreId);

    /** ADMIN: gỡ khỏi kho score mẫu (bản nhạc vẫn giữ nguyên, vẫn công khai). */
    ScoreDetailResponse unmarkOfficial(String scoreId);

    /**
     * ADMIN: mọi bản nhạc trong hệ thống, tìm theo từ khóa, lọc visibility/kho mẫu/nguồn/độ khó. sort: UPDATED (mặc định,
     * mới nhất trước), CREATED, TITLE (A-Z), VIEWS (nhiều nhất trước).
     */
    PageResponse<ScoreSummaryResponse> getAllForAdmin(
            int page,
            int size,
            String keyword,
            String visibility,
            String official,
            String source,
            String difficulty,
            String sort);

    /** ADMIN: đặt thẳng PUBLIC hoặc PRIVATE (PRIVATE kèm lý do, gỡ khỏi kho mẫu, báo cho chủ). */
    ScoreDetailResponse setVisibilityByAdmin(String scoreId, Visibility visibility, String reason);

    /** ADMIN: các bản nhạc chủ đã xin công khai và đang chờ duyệt (cũ nhất trước). */
    PageResponse<ScoreSummaryResponse> getPendingPublic(int page, int size);

    /** ADMIN: duyệt công khai, bản nhạc chuyển sang PUBLIC. */
    ScoreDetailResponse approvePublic(String scoreId);

    /** ADMIN: từ chối công khai, bản nhạc về PRIVATE kèm lý do. */
    ScoreDetailResponse rejectPublic(String scoreId, String reason);

    /**
     * Thay toàn bộ thể loại (tag) của bản nhạc bằng danh sách mới (tối đa 10, rỗng = gỡ hết). Cần quyền sửa bản nhạc.
     */
    ScoreDetailResponse updateTags(String scoreId, List<String> tagIds);
}
