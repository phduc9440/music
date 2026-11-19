package com.ptit.music_be.service.ai;

import com.ptit.music_be.dto.request.ai.ChordSuggestionRequest;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;

/** Gợi ý hợp âm tự động (R3): tạo tác vụ, kết quả thành đề xuất sửa do hệ thống gửi. */
public interface ChordSuggestionService {

    /**
     * Tạo tác vụ CHORD_GENERATION cho version hiện hành. Cần quyền nhận xét (REVIEW). Lỗi theo thứ tự: SCORE_NOT_EXISTED
     * (2001), UNAUTHORIZED (1002), CHORD_STYLE_INVALID (3130), MUSICXML_NOT_READY, SCORE_BUSY (2201, OMR đang chạy),
     * CHORD_TASK_RUNNING (3131), CHORD_SUGGESTION_PENDING (3132, payload {@code {suggestionId}}), PLAN_LIMIT_REACHED
     * (3702).
     */
    AiTaskResponse request(String scoreId, ChordSuggestionRequest request);
}
