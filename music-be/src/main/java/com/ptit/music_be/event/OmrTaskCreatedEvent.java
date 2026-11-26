package com.ptit.music_be.event;

/**
 * Phát ra khi vừa tạo một tác vụ OMR mới. Bộ điều phối (AiTaskDispatcher, nhánh feature/omr-preprocess) nghe sự kiện
 * này với {@code @TransactionalEventListener(phase = AFTER_COMMIT)} để chỉ gửi sang music-ai sau khi DB đã commit.
 */
public record OmrTaskCreatedEvent(String taskId, String scoreId) {}
