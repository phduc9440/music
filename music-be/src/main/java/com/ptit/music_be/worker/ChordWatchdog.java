package com.ptit.music_be.worker;

import java.time.LocalDateTime;
import java.util.ArrayList;
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
 * Job quét tác vụ gợi ý hợp âm mỗi phút (ví dụ backend khởi động lại giữa chừng nên mất sự kiện), task lỗi FAILED
 * TASK_TIMEOUT, không gửi lại; người dùng bấm lại là được vì task lỗi không tính hạn mức:
 * <ul>
 *   <li>PROCESSING: tính từ lúc bắt đầu chạy ({@code startedAt}) quá 5 phút.
 *   <li>PENDING: tính từ lúc tạo quá 15 phút. Mốc dài hơn vì task phải xếp hàng sau tối đa 20 task khác trên một luồng,
 *       không thể coi thời gian chờ trong hàng như thời gian chạy.
 * </ul>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ChordWatchdog {

    static final int TIMEOUT_MINUTES = 5;
    static final int PENDING_TIMEOUT_MINUTES = 15;
    static final List<AiTaskType> TYPES = List.of(AiTaskType.CHORD_GENERATION);

    private final AiTaskRepository aiTaskRepository;
    private final ChordGenerationWorker chordGenerationWorker;

    @Scheduled(
            fixedDelayString = "${chords.watchdog-interval-ms:60000}",
            initialDelayString = "${chords.watchdog-initial-delay-ms:60000}")
    public void sweep() {
        try {
            LocalDateTime now = LocalDateTime.now();
            List<AiTask> stuck = new ArrayList<>(aiTaskRepository.findByTaskTypeInAndStatusAndStartedAtBefore(
                    TYPES, AiTaskStatus.PROCESSING, now.minusMinutes(TIMEOUT_MINUTES)));
            stuck.addAll(aiTaskRepository.findByTaskTypeInAndStatusAndUpdatedAtBefore(
                    TYPES, AiTaskStatus.PENDING, now.minusMinutes(PENDING_TIMEOUT_MINUTES)));
            for (AiTask task : stuck) {
                chordGenerationWorker.fail(task.getId(), AiTaskError.TASK_TIMEOUT.name());
            }
        } catch (RuntimeException e) {
            log.error("Job quét task gợi ý hợp âm gặp lỗi", e);
        }
    }
}
