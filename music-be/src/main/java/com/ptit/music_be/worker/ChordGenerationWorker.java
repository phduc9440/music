package com.ptit.music_be.worker;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import jakarta.annotation.PreDestroy;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.client.AiServiceClient;
import com.ptit.music_be.client.ChordGenerationResult;
import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.ChordStyle;
import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.ScoreSuggestion;
import com.ptit.music_be.event.ChordTaskCreatedEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.CollabErrorCode;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.service.score.ScoreEditService;
import com.ptit.music_be.service.score.SuggestionService;
import com.ptit.music_be.service.storage.FileStorageService;

import lombok.extern.slf4j.Slf4j;

/**
 * Chạy tác vụ gợi ý hợp âm (R3) sau khi DB đã commit:
 *
 * <ol>
 *   <li>PENDING → PROCESSING (bỏ qua nếu task đã bị hủy hoặc đã chạy).
 *   <li>Ghi MusicXML của {@code baseVersion} ra {@code scores/{id}/chords/{taskId}-in.musicxml}.
 *   <li>Gọi music-ai {@code POST /chords/generate} (đồng bộ), đọc file {@code -out}.
 *   <li>Tạo đề xuất do hệ thống gửi ({@link SuggestionService#createFromSystem}); task COMPLETED với
 *       {@code result_data = {suggestionId, key, filled, skipped}}.
 * </ol>
 *
 * Lỗi: task FAILED với mã ở đầu {@code error_message}; hai file tạm luôn bị xóa.
 */
@Component
@Slf4j
public class ChordGenerationWorker {

    static final int QUEUE_CAPACITY = 20;
    static final int MAX_ERROR_LENGTH = 500;

    private final AiTaskRepository aiTaskRepository;
    private final ScoreEditService scoreEditService;
    private final SuggestionService suggestionService;
    private final FileStorageService fileStorageService;
    private final AiServiceClient aiServiceClient;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            1, 1, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>(QUEUE_CAPACITY), runnable -> {
                Thread thread = new Thread(runnable, "chord-worker");
                thread.setDaemon(true);
                return thread;
            });

    public ChordGenerationWorker(
            AiTaskRepository aiTaskRepository,
            ScoreEditService scoreEditService,
            SuggestionService suggestionService,
            FileStorageService fileStorageService,
            AiServiceClient aiServiceClient,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager) {
        this.aiTaskRepository = aiTaskRepository;
        this.scoreEditService = scoreEditService;
        this.suggestionService = suggestionService;
        this.fileStorageService = fileStorageService;
        this.aiServiceClient = aiServiceClient;
        this.objectMapper = objectMapper;
        // REQUIRES_NEW: listener AFTER_COMMIT chạy khi transaction cũ đã xong
        this.tx = new TransactionTemplate(transactionManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCreated(ChordTaskCreatedEvent event) {
        try {
            executor.execute(() -> process(event.taskId()));
        } catch (RejectedExecutionException e) {
            fail(event.taskId(), AiTaskError.AI_SERVICE_UNAVAILABLE.name());
        }
    }

    /** Dữ liệu của một lần chạy, đọc trong transaction đầu tiên. */
    record Job(String taskId, String scoreId, ChordStyle style, int baseVersion, boolean replaceExisting) {}

    void process(String taskId) {
        Job job;
        try {
            job = begin(taskId);
        } catch (RuntimeException e) {
            log.error("Không bắt đầu được task gợi ý hợp âm {}", taskId, e);
            fail(taskId, AiTaskError.JOB_REJECTED + ": lỗi hệ thống");
            return;
        }
        if (job == null) {
            return;
        }

        String inPath = "scores/%s/chords/%s-in.musicxml".formatted(job.scoreId(), taskId);
        String outPath = "scores/%s/chords/%s-out.musicxml".formatted(job.scoreId(), taskId);
        try {
            byte[] base = scoreEditService
                    .getVersionContentForSystem(job.scoreId(), job.baseVersion())
                    .bytes();
            fileStorageService.store(new ByteArrayInputStream(base), inPath);
            ChordGenerationResult result =
                    aiServiceClient.generateChords(inPath, outPath, job.style().name(), job.replaceExisting());
            byte[] proposed = Files.readAllBytes(fileStorageService.resolve(outPath));
            String title = "Gợi ý hợp âm (" + job.style().label() + ")";
            String description = "Giọng " + result.key() + ", " + result.filled()
                    + (job.replaceExisting() ? " hợp âm thay cho hợp âm cũ" : " hợp âm được thêm");
            completeWithSuggestion(job, proposed, title, description, result);
        } catch (AppException e) {
            fail(
                    taskId,
                    e.getErrorCode() == CollabErrorCode.SUGGESTION_EMPTY
                            ? (job.replaceExisting()
                                            ? AiTaskError.CHORD_NO_CHANGE
                                            : AiTaskError.CHORD_ALREADY_HARMONIZED)
                                    .name()
                            : AiTaskError.JOB_REJECTED + ": " + e.getErrorCode().name());
        } catch (RestClientResponseException e) {
            fail(taskId, restError(taskId, e));
        } catch (RestClientException e) {
            log.warn("Không gọi được music-ai cho task gợi ý hợp âm {}: {}", taskId, e.getMessage());
            fail(taskId, AiTaskError.AI_SERVICE_UNAVAILABLE.name());
        } catch (IOException | RuntimeException e) {
            log.error("Task gợi ý hợp âm {} lỗi", taskId, e);
            fail(taskId, AiTaskError.JOB_REJECTED + ": lỗi hệ thống");
        } finally {
            deleteQuietly(inPath);
            deleteQuietly(outPath);
        }
    }

    /** 4xx có {@code detail.code} của music-ai thì đổi sang mã của task; 5xx coi như music-ai không dùng được. */
    private String restError(String taskId, RestClientResponseException e) {
        log.warn(
                "music-ai trả {} cho task gợi ý hợp âm {}: {}",
                e.getStatusCode().value(),
                taskId,
                e.getResponseBodyAsString());
        if (!e.getStatusCode().is4xxClientError()) {
            return AiTaskError.AI_SERVICE_UNAVAILABLE.name();
        }
        String code = "";
        try {
            JsonNode body = objectMapper.readTree(e.getResponseBodyAsString());
            code = body.path("detail").path("code").asText("");
        } catch (IOException | RuntimeException ignored) {
            // thân phản hồi không phải JSON
        }
        return switch (code) {
            case "NO_MELODY" -> AiTaskError.CHORD_NO_MELODY.name();
            case "ALREADY_HARMONIZED" -> AiTaskError.CHORD_ALREADY_HARMONIZED.name();
            default ->
                AiTaskError.JOB_REJECTED + ": "
                        + (code.isEmpty() ? e.getStatusCode().value() : code);
        };
    }

    // ---------------------------------------------------------------------------------------- state changes

    private Job begin(String taskId) {
        return tx.execute(status -> {
            Optional<AiTask> found = aiTaskRepository.findByIdForUpdate(taskId);
            if (found.isEmpty() || found.get().getStatus() != AiTaskStatus.PENDING) {
                return null;
            }
            AiTask task = found.get();
            JsonNode input = readJson(task.getInputData());
            Optional<ChordStyle> style = ChordStyle.parse(input.path("style").asText(null));
            int baseVersion = input.path("baseVersion").asInt(0);
            if (style.isEmpty() || baseVersion < 1 || task.getScore() == null) {
                markFailed(task, AiTaskError.JOB_REJECTED + ": thiếu dữ liệu đầu vào");
                return null;
            }
            task.setStatus(AiTaskStatus.PROCESSING);
            task.setProgress(10);
            task.setStartedAt(LocalDateTime.now());
            aiTaskRepository.save(task);
            return new Job(
                    taskId,
                    task.getScore().getId(),
                    style.get(),
                    baseVersion,
                    input.path("replaceExisting").asBoolean(false));
        });
    }

    /**
     * Tạo đề xuất và đánh dấu COMPLETED trong cùng một transaction, giữ khóa dòng task: nếu job quét đã báo TASK_TIMEOUT
     * (hoặc người dùng hủy) thì không tạo đề xuất nữa, tránh có đề xuất mở trong khi task báo lỗi và chặn lần bấm lại.
     */
    private void completeWithSuggestion(
            Job job, byte[] proposed, String title, String description, ChordGenerationResult result) {
        tx.executeWithoutResult(
                status -> aiTaskRepository.findByIdForUpdate(job.taskId()).ifPresent(task -> {
                    if (task.getStatus() != AiTaskStatus.PROCESSING) {
                        log.info(
                                "Task gợi ý hợp âm {} không còn chạy ({}), bỏ kết quả", job.taskId(), task.getStatus());
                        return;
                    }
                    ScoreSuggestion suggestion = suggestionService.createFromSystem(
                            job.scoreId(),
                            proposed,
                            job.baseVersion(),
                            SuggestionSource.CHORD_GENERATION,
                            title,
                            description);
                    ObjectNode data = objectMapper.createObjectNode();
                    data.put("suggestionId", suggestion.getId());
                    data.put("key", result.key());
                    data.put("filled", result.filled());
                    data.put("skipped", result.skipped());
                    task.setStatus(AiTaskStatus.COMPLETED);
                    task.setProgress(100);
                    task.setResultData(data.toString());
                    task.setFinishedAt(LocalDateTime.now());
                    aiTaskRepository.save(task);
                }));
    }

    /** Báo task FAILED nếu nó còn PENDING/PROCESSING (đã hủy hoặc xong thì giữ nguyên). Dùng cả cho job quét. */
    public void fail(String taskId, String message) {
        try {
            tx.executeWithoutResult(
                    status -> aiTaskRepository.findByIdForUpdate(taskId).ifPresent(task -> {
                        if (task.getStatus() == AiTaskStatus.PENDING || task.getStatus() == AiTaskStatus.PROCESSING) {
                            markFailed(task, message);
                        }
                    }));
        } catch (RuntimeException e) {
            log.error("Không ghi được lỗi cho task gợi ý hợp âm {}", taskId, e);
        }
    }

    private void markFailed(AiTask task, String message) {
        task.setStatus(AiTaskStatus.FAILED);
        task.setErrorMessage(message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message);
        task.setFinishedAt(LocalDateTime.now());
        aiTaskRepository.save(task);
    }

    private void deleteQuietly(String path) {
        try {
            fileStorageService.delete(path);
        } catch (RuntimeException e) {
            log.warn("Không xóa được file tạm {}: {}", path, e.getMessage());
        }
    }

    private JsonNode readJson(String json) {
        if (json == null || json.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(json);
        } catch (IOException e) {
            return objectMapper.createObjectNode();
        }
    }
}
