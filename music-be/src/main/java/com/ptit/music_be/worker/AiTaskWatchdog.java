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
import com.ptit.music_be.service.ai.OmrQueueEstimator;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Job quét tác vụ OMR mỗi 30 giây (đặc tả mục 6.4):
 *
 * <ol>
 *   <li>PENDING chưa gửi được (step còn null) quá 30 giây (lỗi gửi, hoặc server khởi động lại làm mất sự kiện): gửi
 *       lại; đã gửi lại tối đa 2 lần mà vẫn lỗi thì FAILED AI_SERVICE_UNAVAILABLE.
 *   <li>PROCESSING không có callback nào quá 10 phút: FAILED TASK_TIMEOUT.
 *   <li>Task đã được music-ai nhận nhưng mãi chưa chạy (QUEUED) quá hạn: FAILED TASK_TIMEOUT (thường do music-ai khởi
 *       động lại và mất hàng đợi). Hạn = queued-timeout-minutes cộng hai lần thời gian chờ ước lượng theo số trang đứng
 *       trước (OMR-10), để lúc đông người task đang chờ đúng lượt không bị báo lỗi.
 *   <li>music-ai đầy hàng (step BUSY): gửi lại sau mỗi pendingResendSeconds, không tính vào số lần gửi lỗi; chờ quá hạn
 *       như trên thì TASK_TIMEOUT.
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
    private final OmrQueueEstimator queueEstimator;

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
        // music-ai đầy hàng lúc gửi: gửi lại, quá hạn chờ thì báo hết giờ
        for (AiTask task : aiTaskRepository.findByTaskTypeAndStatusAndStepAndUpdatedAtBefore(
                AiTaskType.OMR_CONVERSION, AiTaskStatus.PENDING, AiTaskStep.BUSY.name(), before)) {
            try {
                if (waitedTooLong(task, task.getCreatedAt())) {
                    timeout(task);
                } else {
                    aiTaskDispatcher.dispatch(task.getId());
                }
            } catch (RuntimeException e) {
                log.warn("Không gửi lại được task {} đang chờ music-ai rảnh: {}", task.getId(), e.getMessage());
            }
        }
    }

    /** Đã chờ từ {@code since} quá hạn: queued-timeout-minutes + 2 lần thời gian chờ ước lượng theo hàng đợi. */
    private boolean waitedTooLong(AiTask task, LocalDateTime since) {
        if (since == null) {
            return false;
        }
        long allowed = properties.getQueuedTimeoutMinutes() * 60L + 2 * queueEstimator.waitSeconds(task);
        return since.plusSeconds(allowed).isBefore(LocalDateTime.now());
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
            // Hàng dài (buổi demo, lớp học): còn trong thời gian chờ ước lượng thì chưa phải treo
            if (waitedTooLong(task, task.getUpdatedAt())) {
                timeout(task);
            }
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
