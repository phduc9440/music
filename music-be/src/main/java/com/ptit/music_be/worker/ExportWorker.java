package com.ptit.music_be.worker;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
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
import com.ptit.music_be.dto.enums.AiTaskError;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskStep;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.event.ExportTaskCreatedEvent;
import com.ptit.music_be.exception.MuseScoreException;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.MuseScoreCliService;

import lombok.extern.slf4j.Slf4j;

/**
 * Chạy tác vụ xuất file nền (đặc tả 5.2): PREPARE (music-ai) → RENDER (MuseScore) → SAVE.
 *
 * <p>Chạy trên bộ luồng riêng (2 luồng, hàng đợi 50) thay vì khai báo bean {@code Executor}, để không làm đổi executor
 * mặc định của {@code @Async} (gửi email). Mỗi bước ghi trạng thái trong transaction riêng có khóa dòng task; thấy task
 * không còn PROCESSING (đã hủy, hết hạn) thì dừng và dọn file.
 */
@Component
@Slf4j
public class ExportWorker {

    static final int QUEUE_CAPACITY = 50;
    static final int MAX_ERROR_LENGTH = 500;

    private final AiTaskRepository aiTaskRepository;
    private final ScoreFileRepository scoreFileRepository;
    private final FileStorageService fileStorageService;
    private final MuseScoreCliService museScoreCliService;
    private final AiServiceClient aiServiceClient;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            2, 2, 0L, TimeUnit.MILLISECONDS, new LinkedBlockingQueue<>(QUEUE_CAPACITY), runnable -> {
                Thread thread = new Thread(runnable, "export-worker");
                thread.setDaemon(true);
                return thread;
            });

    public ExportWorker(
            AiTaskRepository aiTaskRepository,
            ScoreFileRepository scoreFileRepository,
            FileStorageService fileStorageService,
            MuseScoreCliService museScoreCliService,
            AiServiceClient aiServiceClient,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager) {
        this.aiTaskRepository = aiTaskRepository;
        this.scoreFileRepository = scoreFileRepository;
        this.fileStorageService = fileStorageService;
        this.museScoreCliService = museScoreCliService;
        this.aiServiceClient = aiServiceClient;
        this.objectMapper = objectMapper;
        // REQUIRES_NEW: listener AFTER_COMMIT chạy khi transaction cũ đã xong, REQUIRED sẽ không commit được gì
        this.tx = new TransactionTemplate(transactionManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCreated(ExportTaskCreatedEvent event) {
        try {
            executor.execute(() -> process(event.taskId()));
        } catch (RejectedExecutionException e) {
            fail(event.taskId(), AiTaskError.EXPORT_ERROR + ": hàng đợi xuất file đã đầy");
        }
    }

    // ------------------------------------------------------------------------------------------------ pipeline

    /** Dữ liệu của một lần chạy, đọc ra trong transaction đầu tiên để các bước sau không cần giữ entity. */
    record Job(
            String taskId,
            String scoreId,
            String title,
            String composer,
            FileType format,
            JsonNode options,
            int sourceVersion,
            String sourcePath) {}

    /** Ném ra khi task không còn PROCESSING giữa chừng (người dùng hủy, job quét đã báo hết hạn). */
    static final class TaskStoppedException extends RuntimeException {
        TaskStoppedException() {
            super("task đã dừng", null, false, false);
        }
    }

    void process(String taskId) {
        Job job;
        try {
            job = begin(taskId);
        } catch (RuntimeException e) {
            log.error("Không bắt đầu được task xuất {}", taskId, e);
            fail(taskId, AiTaskError.EXPORT_ERROR + ": lỗi hệ thống");
            return;
        }
        if (job == null) {
            return;
        }

        String tmpDir = "scores/" + job.scoreId() + "/tmp/" + taskId;
        String storedPath = null;
        try {
            int transpose = job.options().path("transpose").asInt(0);
            int tempoPercent = job.options().path("tempoPercent").asInt(100);
            String hands = job.options().path("hands").asText("BOTH");

            updateStep(taskId, AiTaskStep.PREPARE, 10);
            String inputPath = job.sourcePath();
            if (transpose != 0 || tempoPercent != 100 || !"BOTH".equals(hands)) {
                inputPath = tmpDir + "/in.musicxml";
                aiServiceClient.prepareMusicXml(
                        job.sourcePath(), inputPath, transpose, tempoPercent, hands, null, null, null, null);
            }

            updateStep(taskId, AiTaskStep.RENDER, 30);
            String extension = job.format() == FileType.MP3 ? "mp3" : "wav";
            Path output = fileStorageService.resolve(tmpDir + "/out." + extension);
            List<String> args = new ArrayList<>();
            if (job.format() == FileType.MP3) {
                args.add("-b");
                args.add(String.valueOf(job.options().path("bitrate").asInt(192)));
            }
            museScoreCliService.convert(fileStorageService.resolve(inputPath), output, args, taskId);

            updateStep(taskId, AiTaskStep.SAVE, 90);
            String finalPath =
                    "scores/%s/audio/v%d-%s.%s".formatted(job.scoreId(), job.sourceVersion(), taskId, extension);
            long size = Files.size(output);
            try (InputStream in = Files.newInputStream(output)) {
                storedPath = fileStorageService.store(in, finalPath);
            }
            if (!complete(job, storedPath, size)) {
                // Task đã bị hủy hoặc hết hạn trong lúc xử lý: không ghi kết quả
                fileStorageService.delete(storedPath);
                storedPath = null;
            }
        } catch (TaskStoppedException e) {
            log.info("Task xuất {} đã dừng giữa chừng", taskId);
        } catch (MuseScoreException e) {
            fail(taskId, e.getMessage());
        } catch (RestClientResponseException e) {
            fail(taskId, restError(e));
        } catch (RestClientException e) {
            log.warn("Không gọi được music-ai cho task xuất {}: {}", taskId, e.getMessage());
            fail(taskId, AiTaskError.AI_SERVICE_UNAVAILABLE.name());
        } catch (IOException | RuntimeException e) {
            log.error("Task xuất {} lỗi", taskId, e);
            fail(taskId, AiTaskError.EXPORT_ERROR + ": lỗi hệ thống");
        } finally {
            fileStorageService.deleteDirectory(tmpDir);
            // Ghi DB lỗi sau khi đã lưu file thì file thành mồ côi: xóa luôn
            if (storedPath != null && !isCompleted(taskId)) {
                fileStorageService.delete(storedPath);
            }
        }
    }

    private static String restError(RestClientResponseException e) {
        if (e.getStatusCode().is4xxClientError()) {
            String body = e.getResponseBodyAsString();
            return AiTaskError.EXPORT_ERROR + ": " + (body.length() > 300 ? body.substring(0, 300) : body);
        }
        return AiTaskError.AI_SERVICE_UNAVAILABLE.name();
    }

    // ---------------------------------------------------------------------------------------- state changes

    /** PENDING → PROCESSING và đọc dữ liệu cần dùng. Trả null nếu task không còn PENDING hoặc thiếu file nguồn. */
    private Job begin(String taskId) {
        return tx.execute(status -> {
            Optional<AiTask> found = aiTaskRepository.findByIdForUpdate(taskId);
            if (found.isEmpty() || found.get().getStatus() != AiTaskStatus.PENDING) {
                return null;
            }
            AiTask task = found.get();
            JsonNode input = readJson(task.getInputData());
            Optional<ScoreFile> source =
                    scoreFileRepository.findById(input.path("sourceFileId").asText(""));
            FileType format = parseFormat(input.path("targetFormat").asText(""));
            if (source.isEmpty() || format == null || task.getScore() == null) {
                markFailed(task, AiTaskError.EXPORT_ERROR + ": thiếu dữ liệu nguồn");
                return null;
            }
            task.setStatus(AiTaskStatus.PROCESSING);
            task.setStep(AiTaskStep.PREPARE.name());
            task.setProgress(5);
            task.setStartedAt(LocalDateTime.now());
            aiTaskRepository.save(task);
            return new Job(
                    taskId,
                    task.getScore().getId(),
                    task.getScore().getTitle(),
                    task.getScore().getComposer(),
                    format,
                    input.path("options"),
                    input.path("sourceVersion").asInt(1),
                    source.get().getStoragePath());
        });
    }

    private void updateStep(String taskId, AiTaskStep step, int progress) {
        Boolean ok = tx.execute(status -> {
            Optional<AiTask> found = aiTaskRepository.findByIdForUpdate(taskId);
            if (found.isEmpty() || found.get().getStatus() != AiTaskStatus.PROCESSING) {
                return false;
            }
            AiTask task = found.get();
            task.setStep(step.name());
            task.setProgress(progress);
            aiTaskRepository.save(task);
            return true;
        });
        if (!Boolean.TRUE.equals(ok)) {
            throw new TaskStoppedException();
        }
    }

    /** Ghi file kết quả và hoàn tất task. False nếu task không còn PROCESSING (khi đó không ghi gì). */
    private boolean complete(Job job, String storedPath, long size) {
        Boolean ok = tx.execute(status -> {
            Optional<AiTask> found = aiTaskRepository.findByIdForUpdate(job.taskId());
            if (found.isEmpty() || found.get().getStatus() != AiTaskStatus.PROCESSING) {
                return false;
            }
            AiTask task = found.get();

            ObjectNode meta = objectMapper.createObjectNode();
            meta.put("sourceVersion", job.sourceVersion());
            meta.set("options", job.options());

            // Hạ bản cũ cùng loại và cùng tùy chọn: chỉ giữ một bản hiện hành cho mỗi bộ tùy chọn
            for (ScoreFile old :
                    scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(job.scoreId(), job.format())) {
                if (old.getSourceTaskId() != null
                        && (old.getIsCurrent() == null || old.getIsCurrent())
                        && job.options().equals(readJson(old.getMeta()).get("options"))) {
                    old.setIsCurrent(false);
                    scoreFileRepository.save(old);
                }
            }

            boolean mp3 = job.format() == FileType.MP3;
            ScoreFile saved = scoreFileRepository.save(ScoreFile.builder()
                    .score(task.getScore())
                    .fileType(job.format())
                    .originalFileName(downloadName(job.title(), mp3 ? "mp3" : "wav"))
                    .storagePath(storedPath)
                    .contentType(mp3 ? "audio/mpeg" : "audio/wav")
                    .sizeBytes(size)
                    .version(job.sourceVersion())
                    .isCurrent(true)
                    .sourceTaskId(job.taskId())
                    .meta(meta.toString())
                    .build());

            ObjectNode result = objectMapper.createObjectNode();
            result.put("fileId", saved.getId());
            task.setStatus(AiTaskStatus.COMPLETED);
            task.setStep(AiTaskStep.SAVE.name());
            task.setProgress(100);
            task.setResultData(result.toString());
            task.setFinishedAt(LocalDateTime.now());
            aiTaskRepository.save(task);
            return true;
        });
        return Boolean.TRUE.equals(ok);
    }

    private boolean isCompleted(String taskId) {
        return Boolean.TRUE.equals(tx.execute(status -> aiTaskRepository
                .findById(taskId)
                .map(t -> t.getStatus() == AiTaskStatus.COMPLETED)
                .orElse(false)));
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
            log.error("Không ghi được lỗi cho task xuất {}", taskId, e);
        }
    }

    private void markFailed(AiTask task, String message) {
        task.setStatus(AiTaskStatus.FAILED);
        task.setErrorMessage(message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message);
        task.setFinishedAt(LocalDateTime.now());
        aiTaskRepository.save(task);
    }

    // ---------------------------------------------------------------------------------------------- helpers

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

    private static FileType parseFormat(String name) {
        try {
            return FileType.valueOf(name);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Tên file tải về: tiêu đề bản nhạc bỏ ký tự không hợp lệ trong tên file, tối đa 100 ký tự. */
    static String downloadName(String title, String extension) {
        String clean = title == null
                ? ""
                : title.replaceAll("[/\\\\:*?\"<>|\\p{Cntrl}]", " ").trim();
        if (clean.length() > 100) {
            clean = clean.substring(0, 100).trim();
        }
        return (clean.isEmpty() ? "score" : clean) + "." + extension;
    }
}
