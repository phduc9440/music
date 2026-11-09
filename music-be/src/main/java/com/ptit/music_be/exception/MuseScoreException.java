package com.ptit.music_be.exception;

import com.ptit.music_be.dto.enums.AiTaskError;

/** Lỗi khi chạy MuseScore CLI. {@link #getError()} là mã ghi vào đầu {@code ai_tasks.error_message}. */
public class MuseScoreException extends RuntimeException {

    private final AiTaskError error;

    public MuseScoreException(AiTaskError error, String detail) {
        super(detail == null || detail.isBlank() ? error.name() : error.name() + ": " + detail);
        this.error = error;
    }

    public AiTaskError getError() {
        return error;
    }
}
