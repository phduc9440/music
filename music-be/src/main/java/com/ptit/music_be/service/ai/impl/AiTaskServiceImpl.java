package com.ptit.music_be.service.ai.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.enums.ai.ProcessingStatus;
import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.AiErrorCode;
import com.ptit.music_be.exception.code.ScoreErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.ai.AiTaskService;
import com.ptit.music_be.service.ai.MuseScoreCliService;
import com.ptit.music_be.service.ai.OmrQueueEstimator;
import com.ptit.music_be.service.score.ScoreFileService;
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
    OmrQueueEstimator omrQueueEstimator;

    /**
     * Xem tiến độ (OMR-08): người tạo task, quản trị viên, hoặc người có quyền sửa bản nhạc của task (cộng tác viên bấm
     * nhận diện lại thì chủ bản nhạc vẫn theo dõi được, và ngược lại).
     */
    @Override
    @Transactional(readOnly = true)
    public AiTaskResponse getTask(String taskId) {
        AiTask task =
                aiTaskRepository.findById(taskId).orElseThrow(() -> new AppException(AiErrorCode.AI_TASK_NOT_EXISTED));
        boolean allowed = SecurityUtils.hasPermission(AdminPermission.AI_TASKS_MANAGE)
                || isCreator(task)
                || (task.getScore() != null && scoreFileService.canEdit(task.getScore()));
        if (!allowed) {
            throw new AppException(AccountErrorCode.UNAUTHORIZED);
        }
        return withQueue(task);
    }

    private boolean isCreator(AiTask task) {
        return task.getMember() != null
                && SecurityUtils.getCurrentEmail().equals(task.getMember().getEmail());
    }

    /** Chủ bản nhạc của task (null nếu task không gắn bản nhạc). */
    private boolean isScoreOwner(AiTask task) {
        Score score = task.getScore();
        return score != null
                && score.getMember() != null
                && SecurityUtils.getCurrentEmail().equals(score.getMember().getEmail());
    }

    /** Ánh xạ kèm vị trí hàng đợi với task OMR còn chờ (OMR-10). */
    private AiTaskResponse withQueue(AiTask task) {
        AiTaskResponse response = aiTaskMapper.toResponse(task);
        response.setQueue(omrQueueEstimator.estimate(task));
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AiTaskResponse> getTasksOfScore(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ScoreErrorCode.SCORE_NOT_EXISTED));
        // Lịch sử tác vụ AI chỉ dành cho người có quyền sửa bản nhạc (người xem bản công khai không thấy)
        scoreFileService.checkCanEdit(score);
        return aiTaskRepository.findByScoreIdOrderByCreatedAtDesc(scoreId).stream()
                .map(this::withQueue)
                .toList();
    }

    @Override
    @Transactional
    public AiTaskResponse cancelTask(String taskId) {
        // Khóa dòng để callback đến cùng lúc không ghi đè trạng thái CANCELLED
        AiTask task = aiTaskRepository
                .findByIdForUpdate(taskId)
                .orElseThrow(() -> new AppException(AiErrorCode.AI_TASK_NOT_EXISTED));
        // Hủy (OMR-08): người tạo task, chủ bản nhạc hoặc quản trị viên
        if (!SecurityUtils.hasPermission(AdminPermission.AI_TASKS_MANAGE) && !isCreator(task) && !isScoreOwner(task)) {
            throw new AppException(AccountErrorCode.UNAUTHORIZED);
        }
        if (task.getStatus() != AiTaskStatus.PENDING && task.getStatus() != AiTaskStatus.PROCESSING) {
            throw new AppException(AiErrorCode.AI_TASK_NOT_CANCELLABLE);
        }

        task.setStatus(AiTaskStatus.CANCELLED);
        task.setErrorMessage(AiTaskError.CANCELLED_BY_USER.name());
        task.setFinishedAt(LocalDateTime.now());
        aiTaskRepository.save(task);

        Score score = task.getScore();
        if (score != null && task.getTaskType() == AiTaskType.OMR_CONVERSION) {
            // Hủy lần nhận diện lại khi đã có MusicXML từ trước: bản nhạc vẫn dùng được nên giữ COMPLETED. Chưa có kết
            // quả
            // nào thì ghi CANCELLED (không phải FAILED): người dùng tự hủy, thư viện không được báo "Thất bại" (OMR-15)
            boolean hasPreviousResult =
                    scoreFileRepository.existsCurrentFileFromOtherTask(score.getId(), FileType.MUSICXML, task.getId());
            score.setProcessingStatus(
                    (hasPreviousResult ? ProcessingStatus.COMPLETED : ProcessingStatus.CANCELLED).name());
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
