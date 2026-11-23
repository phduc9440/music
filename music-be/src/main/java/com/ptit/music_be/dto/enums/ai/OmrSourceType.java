package com.ptit.music_be.dto.enums.ai;

/**
 * Loại bản gốc người dùng tải lên cho OMR. Lưu trong {@code ai_tasks.input_data.sourceType}, dùng cho thống kê
 * SER (1.7) và để music-ai chọn cách tiền xử lý.
 */
public enum OmrSourceType {
    /** Ảnh chụp bằng điện thoại/máy ảnh. */
    PHOTO,
    /** Bản scan. */
    SCAN,
    /** PDF gốc xuất từ phần mềm (không phải scan). */
    PDF_NATIVE
}
