package com.ptit.music_be.service.practice;

import com.ptit.music_be.dto.request.PracticeSessionRequest;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.PracticeSessionResponse;

public interface PracticeSessionService {

    /** Lưu một phiên tập của tôi (bài phải xem được). */
    PracticeSessionResponse create(PracticeSessionRequest request);

    /** Lịch sử phiên tập của tôi, mới nhất trước; scoreId có thể để trống. */
    PageResponse<PracticeSessionResponse> getMySessions(String scoreId, int page, int size);

    /** Chi tiết một phiên (kèm log lỗi), chỉ chủ phiên xem được. */
    PracticeSessionResponse getSession(String id);

    /** Xóa một phiên của tôi. */
    void delete(String id);
}
