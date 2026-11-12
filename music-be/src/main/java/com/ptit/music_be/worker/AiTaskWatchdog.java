package com.ptit.music_be.worker;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.ptit.music_be.configuration.AiServiceProperties;
import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskStep;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.service.ai.InternalAiTaskService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Job quét tác vụ OMR mỗi 30 giây (đặc tả mục 6.4):
 *
 * <ol>
 *   <li>PENDING chưa gửi được (step còn null) quá 30 giây (lỗi gửi, hoặc server khởi động lại làm mất sự kiện): gửi
 *       lại; đã gửi lại tối đa 2 lần mà vẫn lỗi thì FAILED AI_SERVICE_UNAVAILABLE.
 *   <li>PROCESSING không có callback nào quá 10 phút: FAILED TASK_TIMEOUT.
 *   <li>Task đã được music-ai nhận nhưng mãi chưa chạy (QUEUED) quá 30 phút: FAILED TASK_TIMEOUT (thường do music-ai
 *       khởi động lại và mất hàng đợi).
 * </ol>
 *
 * Mọi thay đổi trạng thái đi qua {@link InternalAiTaskService} (cũng cập nhật scores.processing_status).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiTaskWatchdog {

    private final AiTaskRepository aiTaskRepository;
    private final InternalAiTaskService internalAiTaskService;
    private final AiTaskDispatcher aiTaskDispatcher;
    private final AiServiceProperties properties;

    @Scheduled(
            fixedDelayString = "${app.ai.watchdog-interval-ms:30000}",
            initialDelayString = "${app.ai.watchdog-initial-delay-ms:30000}")
    public void sweep() {
        try {
            resendUnsent();
            expireStuck();
        } catch (RuntimeException e) {
            log.error("Job quét task OMR gặp lỗi", e);
        }
    }

    private void resendUnsent() {
        LocalDateTime before = LocalDateTime.now().minusSeconds(properties.getPendingResendSeconds());
        List<AiTask> unsent = aiTaskRepository.findByTaskTypeAndStatusAndStepIsNullAndUpdatedAtBefore(
                AiTaskType.OMR_CONVERSION, AiTaskStatus.PENDING, before);
        for (AiTask task : unsent) {
            try {
                int retries = task.getRetryCount() == null ? 0 : task.getRetryCount();
                if (retries > properties.getMaxResends()) {
                    // Lần gửi đầu + maxResends lần gửi lại đều lỗi
                    internalAiTaskService.fail(task.getId(), AiTaskError.AI_SERVICE_UNAVAILABLE.name(), null);
                } else {
                    aiTaskDispatcher.dispatch(task.getId());
                }
            } catch (RuntimeException e) {
                log.warn("Không xử lý được task PENDING {}: {}", task.getId(), e.getMessage());
            }
        }
    }

    private void expireStuck() {
        LocalDateTime processingBefore = LocalDateTime.now().minusMinutes(properties.getProcessingTimeoutMinutes());
        for (AiTask task : aiTaskRepository.findByTaskTypeAndStatusAndUpdatedAtBefore(
                AiTaskType.OMR_CONVERSION, AiTaskStatus.PROCESSING, processingBefore)) {
            timeout(task);
        }

        LocalDateTime queuedBefore = LocalDateTime.now().minusMinutes(properties.getQueuedTimeoutMinutes());
        for (AiTask task : aiTaskRepository.findByTaskTypeAndStatusAndStepAndUpdatedAtBefore(
                AiTaskType.OMR_CONVERSION, AiTaskStatus.PENDING, AiTaskStep.QUEUED.name(), queuedBefore)) {
            timeout(task);
        }
    }

    private void timeout(AiTask task) {
        try {
            internalAiTaskService.fail(task.getId(), AiTaskError.TASK_TIMEOUT.name(), null);
            // Báo music-ai dừng job (nếu còn); lỗi chỉ ghi log
            aiTaskDispatcher.cancelRemote(task.getId());
        } catch (RuntimeException e) {
            log.warn("Không đặt được TASK_TIMEOUT cho task {}: {}", task.getId(), e.getMessage());
        }
    }
}
