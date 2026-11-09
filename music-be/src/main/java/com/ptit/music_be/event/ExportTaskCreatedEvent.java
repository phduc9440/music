package com.ptit.music_be.event;

/**
 * Phát ra khi vừa tạo một tác vụ xuất file (AUDIO_SYNTHESIS / FORMAT_CONVERSION). {@code ExportWorker} nghe sự kiện
 * này với AFTER_COMMIT để chỉ chạy sau khi DB đã commit.
 */
public record ExportTaskCreatedEvent(String taskId, String scoreId) {}
