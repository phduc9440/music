package com.ptit.music_be.service.impl;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.configuration.AiServiceProperties;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskStep;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.ProcessingStatus;
import com.ptit.music_be.dto.request.AiTaskCompleteRequest;
import com.ptit.music_be.dto.request.AiTaskFileRequest;
import com.ptit.music_be.dto.request.AiTaskProgressRequest;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.InternalAiTaskService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class InternalAiTaskServiceImpl implements InternalAiTaskService {

    static final Set<AiTaskStatus> FINISHED_STATUSES =
            EnumSet.of(AiTaskStatus.COMPLETED, AiTaskStatus.FAILED, AiTaskStatus.CANCELLED);
    /** Loại file chỉ có một bản hiện hành cho mỗi bản nhạc. */
    static final Set<FileType> SINGLE_CURRENT_TYPES = EnumSet.of(FileType.KERN, FileType.MUSICXML, FileType.MIDI);
    /** Độ dài tối đa của error_message lưu lại (cột TEXT, nhưng không cần dài hơn). */
    static final int MAX_ERROR_LENGTH = 1000;

    AiTaskRepository aiTaskRepository;
    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    FileStorageService fileStorageService;
    AiServiceProperties aiServiceProperties;
    ObjectMapper objectMapper;

    @Override
    @Transactional
    public void updateProgress(String taskId, AiTaskProgressRequest request) {
        AiTask task = lockTask(taskId);
        if (isFinished(task)) {
            log.debug("Bỏ qua progress cho task {} đã kết thúc ({})", taskId, task.getStatus());
            return;
        }
        int current = task.getProgress() == null ? 0 : task.getProgress();
        // Tiến độ chỉ được tăng: callback đến trễ/không đúng thứ tự không được kéo thanh tiến độ lùi lại
        if (request.getProgress() < current) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }

        task.setProgress(request.getProgress());
        if (request.getStep() != null) {
            task.setStep(request.getStep().name());
        }
        task.setStatus(AiTaskStatus.PROCESSING);
        if (task.getStartedAt() == null) {
            task.setStartedAt(LocalDateTime.now());
        }
        aiTaskRepository.save(task);
        syncScoreStatus(task, ProcessingStatus.PROCESSING);
    }

    @Override
    @Transactional
    public void addFile(String taskId, AiTaskFileRequest request) {
        AiTask task = lockTask(taskId);
        if (isFinished(task)) {
            log.debug("Bỏ qua file callback cho task {} đã kết thúc ({})", taskId, task.getStatus());
            return;
        }
        Score score = task.getScore();
        if (score == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        FileType fileType = request.getFileType();
        if (fileType == FileType.ORIGINAL_PDF
                || fileType == FileType.ORIGINAL_IMAGE
                || fileType == FileType.ORIGINAL_MUSICXML
                || fileType == FileType.ORIGINAL_MIDI) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }

        String storagePath = validateStoragePath(score.getId(), request.getStoragePath());
        Path onDisk = fileStorageService.resolve(storagePath);
        if (!Files.isRegularFile(onDisk)) {
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }

        // Cùng một đường dẫn (nhận diện lại ghi đè pages/page-001.png) thì cập nhật dòng cũ thay vì thêm dòng trùng
        ScoreFile file = scoreFileRepository
                .findByScoreIdAndStoragePath(score.getId(), storagePath)
                .orElseGet(() -> ScoreFile.builder().score(score).build());
        file.setFileType(fileType);
        file.setStoragePath(storagePath);
        file.setOriginalFileName(storagePath.substring(storagePath.lastIndexOf('/') + 1));
        file.setContentType(
                StringUtils.hasText(request.getContentType())
                        ? request.getContentType()
                        : defaultContentType(fileType));
        file.setSizeBytes(request.getSizeBytes() != null ? request.getSizeBytes() : sizeOf(onDisk));
        file.setPageNumber(request.getPageNumber());
        file.setSourceTaskId(task.getId());
        file.setMeta(toJson(request.getMeta()));
        file.setIsCurrent(true);
        ScoreFile saved = scoreFileRepository.save(file);
        if (SINGLE_CURRENT_TYPES.contains(fileType)) {
            demoteOtherCurrentFiles(score.getId(), saved);
        }
    }

    /**
     * Mỗi (score, file_type) chỉ có một bản hiện hành (mục 1.2 của đặc tả): đặt is_current = false cho các bản khác
     * cùng loại, bản vừa ghi giữ true. PNG không áp dụng vì mỗi trang là một dòng riêng.
     */
    private void demoteOtherCurrentFiles(String scoreId, ScoreFile current) {
        List<ScoreFile> sameType =
                scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, current.getFileType());
        List<ScoreFile> stale = sameType.stream()
                .filter(f -> !f.getId().equals(current.getId()) && !Boolean.FALSE.equals(f.getIsCurrent()))
                .toList();
        stale.forEach(f -> f.setIsCurrent(false));
        if (!stale.isEmpty()) {
            scoreFileRepository.saveAll(stale);
        }
    }

    @Override
    @Transactional
    public void complete(String taskId, AiTaskCompleteRequest request) {
        AiTask task = lockTask(taskId);
        if (isFinished(task)) {
            log.debug("Bỏ qua complete cho task {} đã kết thúc ({})", taskId, task.getStatus());
            return;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        if (request.getResultData() != null) {
            result.putAll(request.getResultData());
        }
        // Ghi lại việc tạm dừng sớm để biết Score chưa có MusicXML dù task đã COMPLETED
        // TODO(feature/omr-export-musicxml-midi): khi pipeline chạy tới EXPORT thì đây không còn là "dừng sớm"
        String stopAfter = aiServiceProperties.getStopAfter();
        if (!AiTaskStep.EXPORT.name().equals(stopAfter)) {
            result.putIfAbsent("stoppedAfter", stopAfter);
        }

        LocalDateTime now = LocalDateTime.now();
        task.setStatus(AiTaskStatus.COMPLETED);
        task.setProgress(100);
        task.setResultData(toJson(result));
        task.setFinishedAt(now);
        if (task.getStartedAt() == null) {
            task.setStartedAt(now);
        }
        aiTaskRepository.save(task);

        Score score = task.getScore();
        if (score != null && task.getTaskType() == AiTaskType.OMR_CONVERSION) {
            applyScoreMetadata(score, request.getScoreMetadata());
            score.setProcessingStatus(ProcessingStatus.COMPLETED.name());
            scoreRepository.save(score);
        }
    }

    @Override
    @Transactional
    public void fail(String taskId, String errorCode, String message) {
        AiTask task = lockTask(taskId);
        if (isFinished(task)) {
            log.debug("Bỏ qua fail cho task {} đã kết thúc ({})", taskId, task.getStatus());
            return;
        }
        String text = StringUtils.hasText(message) ? errorCode + ": " + message.trim() : errorCode;
        task.setStatus(AiTaskStatus.FAILED);
        task.setErrorMessage(text.length() > MAX_ERROR_LENGTH ? text.substring(0, MAX_ERROR_LENGTH) : text);
        task.setFinishedAt(LocalDateTime.now());
        aiTaskRepository.save(task);
        syncScoreStatus(task, ProcessingStatus.FAILED);
        log.warn("Task {} thất bại: {}", taskId, task.getErrorMessage());
    }

    @Override
    @Transactional
    public void markQueued(String taskId) {
        AiTask task = lockTask(taskId);
        // Nếu music-ai đã kịp gửi progress (PROCESSING) trước khi ta ghi QUEUED thì không ghi đè
        if (task.getStatus() == AiTaskStatus.PENDING && task.getStep() == null) {
            task.setStep(AiTaskStep.QUEUED.name());
            aiTaskRepository.save(task);
        }
    }

    @Override
    @Transactional
    public int recordSendFailure(String taskId) {
        AiTask task = lockTask(taskId);
        int retries = task.getRetryCount() == null ? 0 : task.getRetryCount();
        if (task.getStatus() == AiTaskStatus.PENDING) {
            retries++;
            task.setRetryCount(retries);
            aiTaskRepository.save(task);
        }
        return retries;
    }

    // ---------------------------------------------------------------- helpers

    /** Lấy task kèm khóa ghi để các callback đồng thời với hủy/job quét được xử lý lần lượt. */
    private AiTask lockTask(String taskId) {
        return aiTaskRepository
                .findByIdForUpdate(taskId)
                .orElseThrow(() -> new AppException(ErrorCode.AI_TASK_NOT_EXISTED));
    }

    private boolean isFinished(AiTask task) {
        return FINISHED_STATUSES.contains(task.getStatus());
    }

    /** Chỉ đồng bộ scores.processing_status cho task OMR (không đồng bộ theo task audio/convert, mục 0.4). */
    private void syncScoreStatus(AiTask task, ProcessingStatus status) {
        Score score = task.getScore();
        if (score != null && task.getTaskType() == AiTaskType.OMR_CONVERSION) {
            score.setProcessingStatus(status.name());
            scoreRepository.save(score);
        }
    }

    private void applyScoreMetadata(Score score, AiTaskCompleteRequest.ScoreMetadata metadata) {
        if (metadata == null) {
            return;
        }
        if (metadata.getMeasureCount() != null) {
            score.setMeasureCount(metadata.getMeasureCount());
        }
        if (metadata.getKeySignature() != null) {
            score.setKeySignature(metadata.getKeySignature());
        }
        if (metadata.getTimeSignature() != null) {
            score.setTimeSignature(metadata.getTimeSignature());
        }
        if (metadata.getTempoBpm() != null) {
            score.setTempoBpm(metadata.getTempoBpm());
        }
        if (metadata.getStaffCount() != null) {
            score.setStaffCount(metadata.getStaffCount());
        }
        if (metadata.getPageCount() != null) {
            score.setPageCount(metadata.getPageCount());
        }
    }

    /**
     * storagePath phải nằm trong {@code scores/{scoreId}/}: chuẩn hóa dấu gạch, chặn ".." và đường dẫn tuyệt đối để
     * music-ai không thể đăng ký file của bản nhạc khác (hoặc file ngoài storage) vào score này.
     */
    private String validateStoragePath(String scoreId, String rawPath) {
        String path = rawPath.trim().replace('\\', '/');
        if (path.startsWith("/") || path.contains("..") || path.contains("//")) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        if (!path.startsWith("scores/" + scoreId + "/")) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        return path;
    }

    private String defaultContentType(FileType fileType) {
        return switch (fileType) {
            case PNG -> "image/png";
            case MUSICXML -> "application/vnd.recordare.musicxml+xml";
            case MIDI -> "audio/midi";
            case KERN -> "text/plain";
            default -> "application/octet-stream";
        };
    }

    private long sizeOf(Path path) {
        try {
            return Files.size(path);
        } catch (IOException e) {
            return 0L;
        }
    }

    private String toJson(Map<String, Object> value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }
}
