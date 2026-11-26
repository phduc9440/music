package com.ptit.music_be.worker;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.repository.ai.AiTaskRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Job quét tác vụ gợi ý hợp âm mỗi phút: task PROCESSING quá 5 phút hoặc còn chờ (PENDING) quá 30 phút (ví dụ backend
 * khởi động lại giữa chừng nên mất sự kiện) thì FAILED TASK_TIMEOUT, không gửi lại; người dùng bấm lại là được vì task
 * lỗi không tính hạn mức.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ChordWatchdog {

    static final int TIMEOUT_MINUTES = 5;
    /**
     * Task còn chờ trong hàng (PENDING) được đợi lâu hơn (CH-10): thời gian chờ đến lượt không tính là chạy quá lâu. Hàng
     * đợi tối đa {@link ChordGenerationWorker#QUEUE_CAPACITY} task chia cho {@link ChordGenerationWorker#WORKERS} luồng.
     */
    static final int PENDING_TIMEOUT_MINUTES = 30;
    static final List<AiTaskType> TYPES = List.of(AiTaskType.CHORD_GENERATION);

    private final AiTaskRepository aiTaskRepository;
    private final ChordGenerationWorker chordGenerationWorker;

    @Scheduled(
            fixedDelayString = "${chords.watchdog-interval-ms:60000}",
            initialDelayString = "${chords.watchdog-initial-delay-ms:60000}")
    public void sweep() {
        try {
            LocalDateTime now = LocalDateTime.now();
            failOlderThan(AiTaskStatus.PROCESSING, now.minusMinutes(TIMEOUT_MINUTES));
            failOlderThan(AiTaskStatus.PENDING, now.minusMinutes(PENDING_TIMEOUT_MINUTES));
        } catch (RuntimeException e) {
            log.error("Job quét task gợi ý hợp âm gặp lỗi", e);
        }
    }

    private void failOlderThan(AiTaskStatus status, LocalDateTime before) {
        for (AiTask task : aiTaskRepository.findByTaskTypeInAndStatusAndUpdatedAtBefore(TYPES, status, before)) {
            chordGenerationWorker.fail(task.getId(), AiTaskError.TASK_TIMEOUT.name());
        }
    }
}
