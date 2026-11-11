package com.ptit.music_be.service.ai.impl;

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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.configuration.AiServiceProperties;
import com.ptit.music_be.dto.enums.AiTaskError;
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
import com.ptit.music_be.service.ai.InternalAiTaskService;
import com.ptit.music_be.service.referral.ReferralService;
import com.ptit.music_be.service.storage.FileStorageService;

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
    ReferralService referralService;

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
            // Không dùng 404: music-ai coi 404 là "task không còn" và bỏ job im lặng. 400 chỉ làm file này không được
            // ghi nhận, job vẫn chạy tiếp và báo lỗi đúng (ví dụ EXPORT_ERROR) ở bước complete.
            throw new AppException(ErrorCode.INVALID_REQUEST);
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
        // MUSICXML ghi version của chính nó, MIDI ghi version MusicXML nguồn (mục 1.2); các loại khác giữ mặc định 1
        if (request.getVersion() != null) {
            file.setVersion(request.getVersion());
        }
        file.setSourceTaskId(task.getId());
        file.setMeta(toJson(request.getMeta()));
        file.setIsCurrent(true);
        ScoreFile saved = scoreFileRepository.save(file);
        if (SINGLE_CURRENT_TYPES.contains(fileType)) {
            demoteOtherCurrentFiles(score.getId(), saved);
        }
        // MusicXML hiện hành đổi thì current_version đổi theo ngay (không chờ callback complete), nếu không Editor sẽ
        // so version với giá trị cũ và báo xung đột 409 ở mọi lần Lưu khi complete không bao giờ đến
        if (fileType == FileType.MUSICXML
                && task.getTaskType() == AiTaskType.OMR_CONVERSION
                && saved.getVersion() != null) {
            score.setCurrentVersion(saved.getVersion());
            scoreRepository.save(score);
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

        // Chạy đủ pipeline (omr.stop-after=EXPORT) mà task này không để lại MusicXML nào thì kết quả vô dụng: báo lỗi
        // thay vì để người dùng thấy "hoàn tất" nhưng không mở được bản nhạc (đặc tả mục 2.4, EXPORT_ERROR)
        if (task.getTaskType() == AiTaskType.OMR_CONVERSION
                && task.getScore() != null
                && AiTaskStep.EXPORT.name().equals(aiServiceProperties.getStopAfter())
                && !hasMusicXmlFrom(task)) {
            fail(taskId, AiTaskError.EXPORT_ERROR.name(), "music-ai báo xong nhưng không có MusicXML");
            return;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        if (request.getResultData() != null) {
            result.putAll(request.getResultData());
        }
        // Chỉ khi cấu hình cố ý dừng sớm (omr.stop-after khác EXPORT) mới ghi lại để biết Score chưa có MusicXML
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
            syncCurrentVersion(score);
            removeStalePages(score, task);
            score.setProcessingStatus(ProcessingStatus.COMPLETED.name());
            scoreRepository.save(score);
            // Người được mời số hóa xong bản đầu tiên: thưởng cho cả hai bên (chỉ một lần)
            referralService.onDigitized(task.getMember());
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
        syncScoreStatus(task, failedScoreStatus(task));
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

    /**
     * Nhận diện lại thất bại mà bản nhạc đã có MusicXML từ lần chạy trước thì bản nhạc vẫn dùng được (mở Editor, xem
     * lại): giữ COMPLETED thay vì FAILED. Lỗi vẫn nằm ở ai_tasks.status/error_message của task vừa chạy.
     */
    private ProcessingStatus failedScoreStatus(AiTask task) {
        Score score = task.getScore();
        if (score != null
                && scoreFileRepository.existsCurrentFileFromOtherTask(score.getId(), FileType.MUSICXML, task.getId())) {
            return ProcessingStatus.COMPLETED;
        }
        return ProcessingStatus.FAILED;
    }

    /**
     * Nhận diện lại không xóa ảnh trang cũ từ đầu (music-ai ghi đè từng trang, nên lần chạy lỗi vẫn còn ảnh để xem).
     * Chỉ khi lần chạy mới hoàn tất mới dọn các dòng PNG không do task này ghi (trang thừa khi số trang giảm), file
     * trên đĩa xóa sau khi commit.
     */
    private void removeStalePages(Score score, AiTask task) {
        List<ScoreFile> pages =
                scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(score.getId(), FileType.PNG);
        if (pages.stream().noneMatch(f -> task.getId().equals(f.getSourceTaskId()))) {
            return; // lần chạy này không ghi trang nào (dừng sớm/lạ): không đụng tới dữ liệu cũ
        }
        List<ScoreFile> stale = pages.stream()
                .filter(f -> !task.getId().equals(f.getSourceTaskId()))
                .toList();
        if (stale.isEmpty()) {
            return;
        }
        scoreFileRepository.deleteAll(stale);
        List<String> paths = stale.stream().map(ScoreFile::getStoragePath).toList();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                paths.forEach(fileStorageService::delete);
            }
        });
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
     * scores.current_version luôn bằng version của MusicXML hiện hành (đặc tả mục 1.1: khóa lạc quan cho Editor). Chưa
     * có MusicXML (ví dụ task dừng sớm) thì giữ nguyên giá trị cũ.
     */
    private boolean hasMusicXmlFrom(AiTask task) {
        return scoreFileRepository
                .findByScoreIdAndFileTypeOrderByPageNumberAsc(task.getScore().getId(), FileType.MUSICXML)
                .stream()
                .anyMatch(f -> task.getId().equals(f.getSourceTaskId()));
    }

    private void syncCurrentVersion(Score score) {
        scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(score.getId(), FileType.MUSICXML).stream()
                .filter(f -> !Boolean.FALSE.equals(f.getIsCurrent()) && f.getVersion() != null)
                .map(ScoreFile::getVersion)
                .max(Integer::compare)
                .ifPresent(score::setCurrentVersion);
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
