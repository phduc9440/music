package com.ptit.music_be.event;

/**
 * Phát ra khi vừa tạo một tác vụ gợi ý hợp âm (CHORD_GENERATION). {@code ChordGenerationWorker} nghe sự kiện này với
 * AFTER_COMMIT để chỉ chạy sau khi DB đã commit.
 */
public record ChordTaskCreatedEvent(String taskId, String scoreId) {}
