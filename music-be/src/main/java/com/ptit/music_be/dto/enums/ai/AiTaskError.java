package com.ptit.music_be.dto.enums.ai;

/**
 * Mã lỗi nằm ở đầu {@code ai_tasks.error_message}, dạng "MÃ" hoặc "MÃ: chi tiết" (ví dụ "PAGE_UNREADABLE: trang 3").
 * Web tách phần trước dấu ":" rồi dịch sang tiếng Việt (đặc tả mục 7.3).
 */
public enum AiTaskError {
    /** Ảnh hoặc PDF không đọc được (chi tiết: số trang). */
    PAGE_UNREADABLE,
    /** Không trang nào có dòng kẻ khuông nhạc. */
    NO_STAFF_DETECTED,
    RECOGNITION_EMPTY,
    MERGE_SPINE_MISMATCH,
    KERN_PARSE_ERROR,
    EXPORT_ERROR,
    MUSESCORE_TIMEOUT,
    /** Quá hạn mà không nhận được callback nào từ music-ai. */
    TASK_TIMEOUT,
    /** Không gửi được việc sang music-ai sau khi đã thử lại. */
    AI_SERVICE_UNAVAILABLE,
    /** music-ai từ chối yêu cầu (HTTP 4xx, ví dụ 422 sai dữ liệu). */
    JOB_REJECTED,
    /** Không còn file gốc để gửi đi xử lý. */
    ORIGINAL_FILE_MISSING,
    /** Model nhận diện (Transcoda) bị tắt hoặc nạp lỗi. */
    MODEL_NOT_LOADED,
    /** Người dùng bấm hủy. */
    CANCELLED_BY_USER
}
