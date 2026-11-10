package com.ptit.music_be.service.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ptit.music_be.dto.enums.AiTaskError;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.ProcessingStatus;
import com.ptit.music_be.dto.response.AiTaskResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.AiTaskService;
import com.ptit.music_be.service.MuseScoreCliService;
import com.ptit.music_be.service.ScoreFileService;
import com.ptit.music_be.utils.SecurityUtils;
import com.ptit.music_be.worker.AiTaskDispatcher;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AiTaskServiceImpl implements AiTaskService {

    AiTaskRepository aiTaskRepository;
    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    ScoreFileService scoreFileService;
    AiTaskMapper aiTaskMapper;
    AiTaskDispatcher aiTaskDispatcher;
    MuseScoreCliService museScoreCliService;

    @Override
    @Transactional(readOnly = true)
    public AiTaskResponse getTask(String taskId) {
        AiTask task =
                aiTaskRepository.findById(taskId).orElseThrow(() -> new AppException(ErrorCode.AI_TASK_NOT_EXISTED));
        if (!SecurityUtils.isAdmin()
                && !SecurityUtils.getCurrentEmail().equals(task.getMember().getEmail())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        return aiTaskMapper.toResponse(task);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AiTaskResponse> getTasksOfScore(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        // Lịch sử tác vụ AI chỉ dành cho người có quyền sửa bản nhạc (người xem bản công khai không thấy)
        scoreFileService.checkCanEdit(score);
        return aiTaskRepository.findByScoreIdOrderByCreatedAtDesc(scoreId).stream()
                .map(aiTaskMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public AiTaskResponse cancelTask(String taskId) {
        // Khóa dòng để callback đến cùng lúc không ghi đè trạng thái CANCELLED
        AiTask task = aiTaskRepository
                .findByIdForUpdate(taskId)
                .orElseThrow(() -> new AppException(ErrorCode.AI_TASK_NOT_EXISTED));
        if (!SecurityUtils.isAdmin()
                && !SecurityUtils.getCurrentEmail().equals(task.getMember().getEmail())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        if (task.getStatus() != AiTaskStatus.PENDING && task.getStatus() != AiTaskStatus.PROCESSING) {
            throw new AppException(ErrorCode.AI_TASK_NOT_CANCELLABLE);
        }

        task.setStatus(AiTaskStatus.CANCELLED);
        task.setErrorMessage(AiTaskError.CANCELLED_BY_USER.name());
        task.setFinishedAt(LocalDateTime.now());
        aiTaskRepository.save(task);

        Score score = task.getScore();
        if (score != null && task.getTaskType() == AiTaskType.OMR_CONVERSION) {
            // Hủy lần nhận diện lại khi đã có MusicXML từ trước: bản nhạc vẫn dùng được nên giữ COMPLETED
            boolean hasPreviousResult =
                    scoreFileRepository.existsCurrentFileFromOtherTask(score.getId(), FileType.MUSICXML, task.getId());
            score.setProcessingStatus(
                    (hasPreviousResult ? ProcessingStatus.COMPLETED : ProcessingStatus.FAILED).name());
            scoreRepository.save(score);
        }

        // Chỉ báo music-ai sau khi commit, để nó không dừng job rồi DB lại rollback
        if (task.getTaskType() == AiTaskType.OMR_CONVERSION) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    aiTaskDispatcher.cancelRemote(taskId);
                }
            });
        }
        // Task xuất file: giết tiến trình MuseScore đang chạy (worker thấy task CANCELLED sẽ tự dọn file)
        if (task.getTaskType() == AiTaskType.AUDIO_SYNTHESIS || task.getTaskType() == AiTaskType.FORMAT_CONVERSION) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    museScoreCliService.kill(taskId);
                }
            });
        }
        return aiTaskMapper.toResponse(task);
    }
}
