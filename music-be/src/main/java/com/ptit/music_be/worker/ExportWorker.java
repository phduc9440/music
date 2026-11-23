package com.ptit.music_be.worker;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

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
import com.ptit.music_be.client.MusicXmlNormalizeResult;
import com.ptit.music_be.dto.enums.ai.AiTaskError;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskStep;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.event.ExportTaskCreatedEvent;
import com.ptit.music_be.exception.MuseScoreException;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.ai.MuseScoreCliService;
import com.ptit.music_be.service.export.ExportNames;
import com.ptit.music_be.service.export.MssStyleBuilder;
import com.ptit.music_be.service.storage.FileStorageService;

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
    private final ScoreRepository scoreRepository;
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
            ScoreRepository scoreRepository,
            FileStorageService fileStorageService,
            MuseScoreCliService museScoreCliService,
            AiServiceClient aiServiceClient,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager) {
        this.aiTaskRepository = aiTaskRepository;
        this.scoreFileRepository = scoreFileRepository;
        this.scoreRepository = scoreRepository;
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
        List<String> storedPaths = new ArrayList<>();
        try {
            if (job.format() == FileType.SVG) {
                renderSvg(job, tmpDir, storedPaths);
            } else if (job.format() == FileType.MUSICXML) {
                convertMidi(job, tmpDir, storedPaths);
            } else if (job.format() == FileType.PDF) {
                renderPdf(job, tmpDir, storedPaths);
            } else {
                renderAudio(job, tmpDir, storedPaths);
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
            if (!storedPaths.isEmpty() && !isCompleted(taskId)) {
                storedPaths.forEach(fileStorageService::delete);
            }
        }
    }

    /** MP3/WAV: chuẩn bị MusicXML nếu cần (music-ai) rồi MuseScore xuất âm thanh. */
    private void renderAudio(Job job, String tmpDir, List<String> storedPaths) throws IOException {
        String taskId = job.taskId();
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
        String finalPath = "scores/%s/audio/v%d-%s.%s".formatted(job.scoreId(), job.sourceVersion(), taskId, extension);
        long size = Files.size(output);
        String stored;
        try (InputStream in = Files.newInputStream(output)) {
            stored = fileStorageService.store(in, finalPath);
        }
        storedPaths.add(stored);
        if (!complete(job, stored, size)) {
            // Task đã bị hủy hoặc hết hạn trong lúc xử lý: không ghi kết quả
            fileStorageService.delete(stored);
            storedPaths.clear();
        }
    }

    /**
     * PDF vector (1.30): music-ai đặt tiêu đề/tác giả và bỏ hợp âm nếu cần, sinh file style từ tùy chọn, MuseScore xuất
     * PDF với {@code -S style.mss}. Kết quả phải bắt đầu bằng {@code %PDF} mới được lưu.
     */
    private void renderPdf(Job job, String tmpDir, List<String> storedPaths) throws IOException {
        String taskId = job.taskId();
        boolean showTitle = job.options().path("showTitle").asBoolean(true);
        boolean showChords = job.options().path("showChords").asBoolean(true);

        updateStep(taskId, AiTaskStep.PREPARE, 10);
        String inputPath = tmpDir + "/in.musicxml";
        aiServiceClient.prepareMusicXml(
                job.sourcePath(), inputPath, 0, 100, "BOTH", job.title(), job.composer(), showTitle, !showChords);

        Path style = fileStorageService.resolve(tmpDir + "/style.mss");
        Files.createDirectories(style.getParent());
        Files.writeString(style, MssStyleBuilder.fromOptions(job.options()));

        updateStep(taskId, AiTaskStep.RENDER, 30);
        Path output = fileStorageService.resolve(tmpDir + "/out.pdf");
        museScoreCliService.convert(
                fileStorageService.resolve(inputPath), output, List.of("-S", style.toString()), taskId);
        if (!startsWithPdfMagic(output)) {
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "file kết quả không phải PDF");
        }

        updateStep(taskId, AiTaskStep.SAVE, 90);
        String finalPath = "scores/%s/export/v%d-%s.pdf".formatted(job.scoreId(), job.sourceVersion(), taskId);
        long size = Files.size(output);
        String stored;
        try (InputStream in = Files.newInputStream(output)) {
            stored = fileStorageService.store(in, finalPath);
        }
        storedPaths.add(stored);
        if (!complete(job, stored, size)) {
            fileStorageService.delete(stored);
            storedPaths.clear();
        }
    }

    private static boolean startsWithPdfMagic(Path file) throws IOException {
        try (InputStream in = Files.newInputStream(file)) {
            byte[] head = in.readNBytes(4);
            return head.length == 4 && head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F';
        }
    }

    /** SVG: MuseScore kết xuất mọi trang ({@code out-1.svg}, {@code out-2.svg}...), mỗi trang một dòng score_files. */
    private void renderSvg(Job job, String tmpDir, List<String> storedPaths) throws IOException {
        String taskId = job.taskId();
        updateStep(taskId, AiTaskStep.RENDER, 30);
        Path output = fileStorageService.resolve(tmpDir + "/out.svg");
        museScoreCliService.convert(fileStorageService.resolve(job.sourcePath()), output, List.of(), taskId);

        List<Path> pages = collectSvgPages(output);
        if (pages.isEmpty()) {
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "MuseScore không tạo ra trang SVG nào");
        }

        updateStep(taskId, AiTaskStep.SAVE, 90);
        List<StoredPage> stored = new ArrayList<>();
        for (int i = 0; i < pages.size(); i++) {
            int number = i + 1;
            String finalPath =
                    "scores/%s/export/v%d-%s-p%02d.svg".formatted(job.scoreId(), job.sourceVersion(), taskId, number);
            long size = Files.size(pages.get(i));
            try (InputStream in = Files.newInputStream(pages.get(i))) {
                String path = fileStorageService.store(in, finalPath);
                storedPaths.add(path);
                stored.add(new StoredPage(path, size, number));
            }
        }
        if (!completeSvg(job, stored)) {
            storedPaths.forEach(fileStorageService::delete);
            storedPaths.clear();
        }
    }

    /** Kết quả ghi bản nhạc chuyển từ MIDI: xong, task đã dừng (hủy/hết hạn), hoặc bị từ chối vì đã có MusicXML. */
    private enum MidiOutcome {
        DONE,
        STOPPED,
        REJECTED
    }

    /**
     * Bản nhạc nhập từ MIDI: MuseScore đổi MIDI gốc thành MusicXML, music-ai chuẩn hóa (gộp track thành piano 2 staff),
     * kết quả là {@code musicxml/v1.musicxml} và các cột {@code scores}. Nhiều track được music-ai gộp theo khóa nhạc và
     * cao độ; các cảnh báo đi vào {@code result_data.warnings}.
     */
    private void convertMidi(Job job, String tmpDir, List<String> storedPaths) throws IOException {
        String taskId = job.taskId();
        updateStep(taskId, AiTaskStep.RENDER, 30);
        String rawPath = tmpDir + "/raw.musicxml";
        museScoreCliService.convert(
                fileStorageService.resolve(job.sourcePath()), fileStorageService.resolve(rawPath), List.of(), taskId);

        updateStep(taskId, AiTaskStep.SAVE, 70);
        String finalPath = "scores/%s/musicxml/v1.musicxml".formatted(job.scoreId());
        MusicXmlNormalizeResult normalized = aiServiceClient.normalizeMusicXml(rawPath, finalPath);
        if (normalized == null) {
            throw new MuseScoreException(AiTaskError.EXPORT_ERROR, "music-ai không trả kết quả chuẩn hóa");
        }
        storedPaths.add(finalPath);

        long size = Files.size(fileStorageService.resolve(finalPath));
        MidiOutcome outcome = completeMidiConversion(job, finalPath, size, normalized);
        if (outcome == MidiOutcome.STOPPED) {
            fileStorageService.delete(finalPath);
        }
        if (outcome != MidiOutcome.DONE) {
            // REJECTED: v1.musicxml có thể đã thuộc về dòng khác nên không được xóa
            storedPaths.clear();
        }
    }

    private MidiOutcome completeMidiConversion(Job job, String storedPath, long size, MusicXmlNormalizeResult result) {
        return tx.execute(status -> {
            Optional<AiTask> found = aiTaskRepository.findByIdForUpdate(job.taskId());
            Optional<Score> foundScore = scoreRepository.findByIdForUpdate(job.scoreId());
            if (found.isEmpty() || found.get().getStatus() != AiTaskStatus.PROCESSING || foundScore.isEmpty()) {
                return MidiOutcome.STOPPED;
            }
            AiTask task = found.get();
            Score score = foundScore.get();
            if (!scoreFileRepository
                    .findByScoreIdAndFileTypeOrderByPageNumberAsc(job.scoreId(), FileType.MUSICXML)
                    .isEmpty()) {
                markFailed(task, AiTaskError.EXPORT_ERROR + ": bản nhạc đã có MusicXML");
                return MidiOutcome.REJECTED;
            }

            ObjectNode meta = objectMapper.createObjectNode();
            meta.put("source", "MIDI");
            meta.put("measureCount", result.measureCount());
            ScoreFile saved = scoreFileRepository.save(ScoreFile.builder()
                    .score(score)
                    .fileType(FileType.MUSICXML)
                    .originalFileName("v1.musicxml")
                    .storagePath(storedPath)
                    .contentType("application/vnd.recordare.musicxml+xml")
                    .sizeBytes(size)
                    .version(1)
                    .isCurrent(true)
                    .meta(meta.toString())
                    .build());

            score.setCurrentVersion(1);
            score.setMeasureCount(result.measureCount());
            score.setKeySignature(result.keySignature());
            score.setTimeSignature(result.timeSignature());
            score.setTempoBpm(result.tempoBpm());
            score.setStaffCount(result.staffCount());
            score.setUpdatedAt(LocalDateTime.now());
            scoreRepository.save(score);

            ObjectNode data = objectMapper.createObjectNode();
            data.put("fileId", saved.getId());
            var warnings = data.putArray("warnings");
            result.warnings().forEach(warnings::add);
            task.setStatus(AiTaskStatus.COMPLETED);
            task.setStep(AiTaskStep.SAVE.name());
            task.setProgress(100);
            task.setResultData(data.toString());
            task.setFinishedAt(LocalDateTime.now());
            aiTaskRepository.save(task);
            return MidiOutcome.DONE;
        });
    }

    /**
     * Các trang SVG MuseScore đã ghi cạnh {@code output}: {@code tên-N.svg} sắp theo N; không có thì nếu {@code output}
     * tự nó tồn tại (bản nhạc một trang) thì đó là trang 1. Rỗng nếu không có gì.
     */
    static List<Path> collectSvgPages(Path output) throws IOException {
        String name = output.getFileName().toString();
        String base = name.substring(0, name.length() - ".svg".length());
        Pattern pattern = Pattern.compile(Pattern.quote(base) + "-(\\d+)\\.svg");
        List<Path> numbered;
        try (Stream<Path> siblings = Files.list(output.toAbsolutePath().getParent())) {
            numbered = siblings.filter(
                            p -> pattern.matcher(p.getFileName().toString()).matches())
                    .filter(p -> p.toFile().length() > 0)
                    .sorted(Comparator.comparingInt(p -> {
                        Matcher m = pattern.matcher(p.getFileName().toString());
                        return m.matches() ? Integer.parseInt(m.group(1)) : 0;
                    }))
                    .toList();
        }
        if (!numbered.isEmpty()) {
            return numbered;
        }
        return Files.isRegularFile(output) && Files.size(output) > 0 ? List.of(output) : List.of();
    }

    record StoredPage(String path, long size, int pageNumber) {}

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
            if (format == FileType.MUSICXML
                    && !scoreFileRepository
                            .findByScoreIdAndFileTypeOrderByPageNumberAsc(
                                    task.getScore().getId(), FileType.MUSICXML)
                            .isEmpty()) {
                markFailed(task, AiTaskError.EXPORT_ERROR + ": bản nhạc đã có MusicXML");
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

            String extension = job.format().name().toLowerCase();
            ScoreFile saved = scoreFileRepository.save(ScoreFile.builder()
                    .score(task.getScore())
                    .fileType(job.format())
                    .originalFileName(downloadName(job.title(), extension))
                    .storagePath(storedPath)
                    .contentType(contentTypeOf(job.format()))
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

    /** Ghi các trang SVG và hoàn tất task. False nếu task không còn PROCESSING (khi đó không ghi gì). */
    private boolean completeSvg(Job job, List<StoredPage> pages) {
        Boolean ok = tx.execute(status -> {
            Optional<AiTask> found = aiTaskRepository.findByIdForUpdate(job.taskId());
            if (found.isEmpty() || found.get().getStatus() != AiTaskStatus.PROCESSING) {
                return false;
            }
            AiTask task = found.get();

            ObjectNode meta = objectMapper.createObjectNode();
            meta.put("sourceVersion", job.sourceVersion());
            meta.set("options", job.options());
            meta.put("pageCount", pages.size());

            // Bộ trang cũ không còn là bản hiện hành (job dọn đêm sẽ xóa)
            for (ScoreFile old :
                    scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(job.scoreId(), FileType.SVG)) {
                if (old.getSourceTaskId() != null && (old.getIsCurrent() == null || old.getIsCurrent())) {
                    old.setIsCurrent(false);
                    scoreFileRepository.save(old);
                }
            }

            var fileIds = objectMapper.createArrayNode();
            for (StoredPage page : pages) {
                ScoreFile saved = scoreFileRepository.save(ScoreFile.builder()
                        .score(task.getScore())
                        .fileType(FileType.SVG)
                        .originalFileName(ExportNames.svgPageName(job.title(), page.pageNumber()))
                        .storagePath(page.path())
                        .contentType("image/svg+xml")
                        .sizeBytes(page.size())
                        .pageNumber(page.pageNumber())
                        .version(job.sourceVersion())
                        .isCurrent(true)
                        .sourceTaskId(job.taskId())
                        .meta(meta.toString())
                        .build());
                fileIds.add(saved.getId());
            }

            ObjectNode result = objectMapper.createObjectNode();
            result.put("fileId", fileIds.get(0).asText());
            result.set("fileIds", fileIds);
            result.put("pageCount", pages.size());
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

    private static String contentTypeOf(FileType format) {
        return switch (format) {
            case MP3 -> "audio/mpeg";
            case WAV -> "audio/wav";
            case PDF -> "application/pdf";
            default -> "application/octet-stream";
        };
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
        return ExportNames.fileName(title, extension);
    }
}
