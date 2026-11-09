package com.ptit.music_be.service.impl;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ptit.music_be.configuration.MuseScoreProperties;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.request.ExportRequest;
import com.ptit.music_be.dto.response.ExportFileResponse;
import com.ptit.music_be.dto.response.ExportResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.event.ExportTaskCreatedEvent;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.ExportService;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.MuseScoreCliService;
import com.ptit.music_be.service.ScoreContentService;
import com.ptit.music_be.service.ScoreFileService;
import com.ptit.music_be.service.export.ExportNames;
import com.ptit.music_be.service.export.ExportOptionsValidator;
import com.ptit.music_be.service.export.ExportSpec;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ExportServiceImpl implements ExportService {

    /** Loại file xuất (khác MUSICXML/MIDI là file gốc của hệ thống). */
    public static final Set<FileType> EXPORT_FILE_TYPES =
            EnumSet.of(FileType.MP3, FileType.WAV, FileType.PDF, FileType.SVG);

    public static final List<AiTaskType> EXPORT_TASK_TYPES =
            List.of(AiTaskType.AUDIO_SYNTHESIS, AiTaskType.FORMAT_CONVERSION);

    static final Set<AiTaskStatus> ACTIVE_STATUSES = Set.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING);

    /** Mỗi người tối đa bấy nhiêu task xuất đang chạy cùng lúc, và bấy nhiêu task xuất trong một giờ. */
    static final int MAX_ACTIVE_TASKS = 2;

    static final int MAX_TASKS_PER_HOUR = 10;

    /** Tempo dùng khi bản nhạc chưa có tempo_bpm (đặc tả 2.4). */
    static final int DEFAULT_TEMPO_BPM = 100;

    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    AiTaskRepository aiTaskRepository;
    MemberRepository memberRepository;
    ScoreFileService scoreFileService;
    FileStorageService fileStorageService;
    ScoreContentService scoreContentService;
    MuseScoreCliService museScoreCliService;
    MuseScoreProperties museScoreProperties;
    ExportOptionsValidator validator;
    AiTaskMapper aiTaskMapper;
    ObjectMapper objectMapper;
    ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public ExportResponse requestExport(String scoreId, ExportRequest request) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);
        ScoreFile source = currentMusicXml(scoreId).orElseThrow(() -> new AppException(ErrorCode.MUSICXML_NOT_READY));
        ExportSpec spec = validator.validate(
                request == null ? null : request.getTargetFormat(),
                request == null ? null : request.getOptions(),
                score);

        // MusicXML và MIDI có sẵn: trả file hiện hành, không cần MuseScore và không tạo task
        if (spec.fileType() == FileType.MUSICXML) {
            return ExportResponse.builder()
                    .cached(true)
                    .file(toFileResponse(source, score))
                    .build();
        }
        if (spec.fileType() == FileType.MIDI) {
            return ExportResponse.builder()
                    .cached(true)
                    .file(toFileResponse(currentMidi(scoreId), score))
                    .build();
        }

        if (!museScoreCliService.isAvailable()) {
            throw new AppException(ErrorCode.EXPORT_NOT_AVAILABLE);
        }
        if (spec.taskType() == AiTaskType.AUDIO_SYNTHESIS
                && estimateSeconds(score, spec.intOption("tempoPercent", 100))
                        > museScoreProperties.getMaxAudioSeconds()) {
            throw new AppException(ErrorCode.AUDIO_TOO_LONG);
        }

        // Khóa dòng người dùng để hai yêu cầu cùng lúc không cùng vượt giới hạn hoặc tạo task trùng
        Member member = memberRepository
                .findByEmailForUpdate(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        int sourceVersion = versionOf(source);
        if (spec.fileType() == FileType.SVG) {
            List<ScoreFile> pages = findCachedSvgPages(scoreId, sourceVersion);
            if (!pages.isEmpty()) {
                if (spec.page() != null && spec.page() > pages.size()) {
                    throw new AppException(ErrorCode.EXPORT_OPTION_INVALID);
                }
                List<ExportFileResponse> files =
                        pages.stream().map(f -> toFileResponse(f, score)).toList();
                return ExportResponse.builder()
                        .cached(true)
                        .file(files.get(0))
                        .files(files)
                        .build();
            }
        } else {
            Optional<ScoreFile> cached = findCached(scoreId, spec, sourceVersion);
            if (cached.isPresent()) {
                return ExportResponse.builder()
                        .cached(true)
                        .file(toFileResponse(cached.get(), score))
                        .build();
            }
        }

        Optional<AiTask> duplicate = findDuplicateTask(scoreId, spec, sourceVersion);
        if (duplicate.isPresent()) {
            return ExportResponse.builder()
                    .cached(false)
                    .task(aiTaskMapper.toResponse(duplicate.get()))
                    .build();
        }

        if (aiTaskRepository.countByMemberIdAndTaskTypeInAndStatusIn(member.getId(), EXPORT_TASK_TYPES, ACTIVE_STATUSES)
                        >= MAX_ACTIVE_TASKS
                || aiTaskRepository.countByMemberIdAndTaskTypeInAndCreatedAtAfter(
                                member.getId(),
                                EXPORT_TASK_TYPES,
                                LocalDateTime.now().minusHours(1))
                        >= MAX_TASKS_PER_HOUR) {
            throw new AppException(ErrorCode.EXPORT_LIMIT_EXCEEDED);
        }

        ObjectNode input = objectMapper.createObjectNode();
        input.put("targetFormat", spec.fileType().name());
        input.put("sourceFileId", source.getId());
        input.put("sourceVersion", sourceVersion);
        input.set("options", spec.options());

        // Không đổi scores.processing_status: xuất file không làm bản nhạc "đang xử lý" (đặc tả 0.4)
        AiTask task = aiTaskRepository.save(AiTask.builder()
                .member(member)
                .score(score)
                .taskType(spec.taskType())
                .status(AiTaskStatus.PENDING)
                .progress(0)
                .inputData(input.toString())
                .build());

        eventPublisher.publishEvent(new ExportTaskCreatedEvent(task.getId(), scoreId));
        return ExportResponse.builder()
                .cached(false)
                .task(aiTaskMapper.toResponse(task))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public SvgZip zipSvgPages(String scoreId, String taskId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);
        List<ScoreFile> pages = scoreFileRepository.findByScoreIdAndFileTypeIn(scoreId, Set.of(FileType.SVG)).stream()
                .filter(f -> taskId.equals(f.getSourceTaskId()))
                .sorted(Comparator.comparing(ScoreFile::getPageNumber, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        if (pages.isEmpty()) {
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(buffer)) {
            int index = 1;
            for (ScoreFile page : pages) {
                byte[] bytes = Files.readAllBytes(fileStorageService.resolve(page.getStoragePath()));
                int number = page.getPageNumber() != null ? page.getPageNumber() : index;
                zip.putNextEntry(new ZipEntry(ExportNames.svgPageName(score.getTitle(), number)));
                zip.write(bytes);
                zip.closeEntry();
                index++;
            }
        } catch (IOException e) {
            log.warn("Không gom được ZIP SVG của task {}: {}", taskId, e.getMessage());
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
        return new SvgZip(ExportNames.safeTitle(score.getTitle()) + "-svg.zip", buffer.toByteArray());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ExportFileResponse> listExports(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);
        return scoreFileRepository.findByScoreIdAndFileTypeIn(scoreId, EXPORT_FILE_TYPES).stream()
                .filter(f -> f.getSourceTaskId() != null && existsOnDisk(f))
                .sorted(Comparator.comparing(ScoreFile::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(f -> toFileResponse(f, score))
                .toList();
    }

    // ------------------------------------------------------------------------------------------------- helpers

    /** Ước lượng thời lượng bản nhạc (giây) ở tempo đã chỉnh. Thiếu số ô nhịp thì coi là 0 (không chặn). */
    static double estimateSeconds(Score score, int tempoPercent) {
        if (score.getMeasureCount() == null || score.getMeasureCount() <= 0) {
            return 0;
        }
        double quartersPerMeasure = quartersPerMeasure(score.getTimeSignature());
        int bpm = score.getTempoBpm() != null && score.getTempoBpm() > 0 ? score.getTempoBpm() : DEFAULT_TEMPO_BPM;
        double effectiveBpm = bpm * tempoPercent / 100.0;
        return score.getMeasureCount() * quartersPerMeasure * 60.0 / effectiveBpm;
    }

    private static double quartersPerMeasure(String timeSignature) {
        if (timeSignature != null) {
            String[] parts = timeSignature.trim().split("/");
            if (parts.length == 2) {
                try {
                    int beats = Integer.parseInt(parts[0].trim());
                    int beatType = Integer.parseInt(parts[1].trim());
                    if (beats > 0 && beatType > 0) {
                        return beats * 4.0 / beatType;
                    }
                } catch (NumberFormatException ignored) {
                    // rơi xuống mặc định 4/4
                }
            }
        }
        return 4.0;
    }

    private Optional<ScoreFile> currentMusicXml(String scoreId) {
        return scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MUSICXML).stream()
                .filter(f -> f.getIsCurrent() == null || f.getIsCurrent())
                .max(Comparator.comparingInt(ExportServiceImpl::versionOf));
    }

    private static int versionOf(ScoreFile file) {
        return file.getVersion() == null ? 1 : file.getVersion();
    }

    private Optional<ScoreFile> findCached(String scoreId, ExportSpec spec, int sourceVersion) {
        return scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, spec.fileType()).stream()
                .filter(f -> f.getSourceTaskId() != null && (f.getIsCurrent() == null || f.getIsCurrent()))
                .filter(f -> versionOf(f) == sourceVersion)
                .filter(f -> spec.options().equals(readMeta(f).get("options")))
                .filter(this::existsOnDisk)
                .findFirst();
    }

    private Optional<AiTask> findDuplicateTask(String scoreId, ExportSpec spec, int sourceVersion) {
        return aiTaskRepository
                .findByScoreIdAndTaskTypeInAndStatusIn(scoreId, EXPORT_TASK_TYPES, ACTIVE_STATUSES)
                .stream()
                .filter(t -> {
                    JsonNode input = parse(t.getInputData());
                    return spec.fileType()
                                    .name()
                                    .equals(input.path("targetFormat").asText())
                            && input.path("sourceVersion").asInt(-1) == sourceVersion
                            && spec.options().equals(input.get("options"));
                })
                .findFirst();
    }

    /** Các trang SVG hiện hành của đúng version MusicXML này (cùng một lần xuất), theo thứ tự trang. */
    private List<ScoreFile> findCachedSvgPages(String scoreId, int sourceVersion) {
        List<ScoreFile> pages = scoreFileRepository.findByScoreIdAndFileTypeIn(scoreId, Set.of(FileType.SVG)).stream()
                .filter(f -> f.getSourceTaskId() != null && (f.getIsCurrent() == null || f.getIsCurrent()))
                .filter(f -> versionOf(f) == sourceVersion)
                .sorted(Comparator.comparing(ScoreFile::getPageNumber, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        // Thiếu một trang trên đĩa thì coi như chưa có, để xuất lại cho đủ bộ
        return pages.stream().allMatch(this::existsOnDisk) ? pages : List.of();
    }

    /** MIDI hiện hành; sinh lại nếu chưa có hoặc cũ hơn MusicXML (ScoreContentService lo, đồng bộ). */
    private ScoreFile currentMidi(String scoreId) {
        scoreContentService.getMidi(scoreId);
        return scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MIDI).stream()
                .filter(f -> f.getIsCurrent() == null || f.getIsCurrent())
                .max(Comparator.comparingInt(ExportServiceImpl::versionOf))
                .orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_EXISTED));
    }

    private boolean existsOnDisk(ScoreFile file) {
        try {
            return Files.isRegularFile(fileStorageService.resolve(file.getStoragePath()));
        } catch (AppException e) {
            return false;
        }
    }

    private ExportFileResponse toFileResponse(ScoreFile file, Score score) {
        JsonNode meta = readMeta(file);
        int sourceVersion = meta.path("sourceVersion").asInt(versionOf(file));
        int current = score.getCurrentVersion() == null ? 0 : score.getCurrentVersion();
        return ExportFileResponse.builder()
                .id(file.getId())
                .scoreId(score.getId())
                .fileType(file.getFileType())
                .originalFileName(file.getOriginalFileName())
                .contentType(file.getContentType())
                .sizeBytes(file.getSizeBytes())
                .pageNumber(file.getPageNumber())
                .taskId(file.getSourceTaskId())
                .createdAt(file.getCreatedAt())
                .downloadUrl("/api/files/" + file.getId() + "/download")
                .options(meta.get("options"))
                .sourceVersion(sourceVersion)
                .outdated(sourceVersion < current)
                .build();
    }

    private JsonNode readMeta(ScoreFile file) {
        return parse(file.getMeta());
    }

    private JsonNode parse(String json) {
        if (json == null || json.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(json);
        } catch (IOException e) {
            log.warn("JSON không đọc được: {}", e.getMessage());
            return objectMapper.createObjectNode();
        }
    }
}
