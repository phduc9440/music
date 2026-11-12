package com.ptit.music_be.dto.enums;

public enum AiTaskStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED,
    /** Người dùng chủ động hủy (dùng ở nhánh feature/omr-preprocess). */
    CANCELLED
}
