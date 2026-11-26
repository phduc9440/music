package com.ptit.music_be.dto.enums.ai;

/** Values stored in {@code Score.processingStatus}. */
public enum ProcessingStatus {
    NONE,
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED,
    /** Người dùng tự hủy lần số hóa đầu tiên (chưa có kết quả nào); khác FAILED để thư viện không báo "Thất bại" (OMR-15). */
    CANCELLED
}
