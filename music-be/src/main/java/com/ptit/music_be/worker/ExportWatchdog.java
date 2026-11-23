package com.ptit.music_be.worker;

import java.time.LocalDateTime;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.service.ai.MuseScoreCliService;
import com.ptit.music_be.service.export.impl.ExportServiceImpl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Quét task xuất file mỗi phút (đặc tả 5.2): PENDING quá 5 phút (máy chủ khởi động lại làm mất hàng đợi trong bộ nhớ)
 * hoặc PROCESSING quá 10 phút không cập nhật thì FAILED {@code TASK_TIMEOUT}. Tách khỏi {@code AiTaskWatchdog} (của
 * OMR) để hai luồng việc không ảnh hưởng nhau.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ExportWatchdog {

    static final int PENDING_TIMEOUT_MINUTES = 5;
    static final int PROCESSING_TIMEOUT_MINUTES = 10;

    private final AiTaskRepository aiTaskRepository;
    private final ExportWorker exportWorker;
    private final MuseScoreCliService museScoreCliService;

    @Scheduled(
            fixedDelayString = "${export.watchdog-interval-ms:60000}",
            initialDelayString = "${export.watchdog-initial-delay-ms:60000}")
    public void sweep() {
        try {
            expire(AiTaskStatus.PENDING, PENDING_TIMEOUT_MINUTES);
            expire(AiTaskStatus.PROCESSING, PROCESSING_TIMEOUT_MINUTES);
        } catch (RuntimeException e) {
            log.error("Job quét task xuất file gặp lỗi", e);
        }
    }

    private void expire(AiTaskStatus status, int minutes) {
        LocalDateTime before = LocalDateTime.now().minusMinutes(minutes);
        for (AiTask task : aiTaskRepository.findByTaskTypeInAndStatusAndUpdatedAtBefore(
                ExportServiceImpl.EXPORT_TASK_TYPES, status, before)) {
            exportWorker.fail(task.getId(), AiTaskError.TASK_TIMEOUT.name());
            museScoreCliService.kill(task.getId());
        }
    }
}
