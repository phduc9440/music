package com.ptit.music_be.service.impl;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.response.ScoreSaveResponse;
import com.ptit.music_be.dto.response.ScoreVersionConflict;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.ScoreEditService;
import com.ptit.music_be.service.ScoreFileService;
import com.ptit.music_be.utils.MusicXmlInspector;
import com.ptit.music_be.utils.MusicXmlSummary;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class ScoreEditServiceImpl implements ScoreEditService {

    /** Số version MusicXML mới nhất được giữ lại cho mỗi bản nhạc (đặc tả mục 3.6). */
    static final int MAX_KEPT_VERSIONS = 20;

    static final String MUSICXML_CONTENT_TYPE = "application/vnd.recordare.musicxml+xml";

    /** Content-Type chấp nhận khi lưu (không tính tham số như charset). */
    private static final Set<String> ACCEPTED_CONTENT_TYPES =
            Set.of(MUSICXML_CONTENT_TYPE, "application/xml", "text/xml");

    private static final List<AiTaskStatus> ACTIVE_STATUSES = List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING);

    /** Chấp nhận {@code "v5"}, {@code v5} và dạng yếu {@code W/"v5"}. */
    private static final Pattern IF_MATCH_PATTERN = Pattern.compile("^(?:W/)?\"?v(\\d{1,9})\"?$");

    private static final ObjectMapper JSON = new ObjectMapper();

    private final ScoreRepository scoreRepository;
    private final ScoreFileRepository scoreFileRepository;
    private final AiTaskRepository aiTaskRepository;
    private final ScoreFileService scoreFileService;
    private final FileStorageService fileStorageService;
    private final long maxMusicXmlBytes;

    public ScoreEditServiceImpl(
            ScoreRepository scoreRepository,
            ScoreFileRepository scoreFileRepository,
            AiTaskRepository aiTaskRepository,
            ScoreFileService scoreFileService,
            FileStorageService fileStorageService,
            @Value("${app.editor.max-musicxml-bytes:5242880}") long maxMusicXmlBytes) {
        this.scoreRepository = scoreRepository;
        this.scoreFileRepository = scoreFileRepository;
        this.aiTaskRepository = aiTaskRepository;
        this.scoreFileService = scoreFileService;
        this.fileStorageService = fileStorageService;
        this.maxMusicXmlBytes = maxMusicXmlBytes;
    }

    @Override
    @Transactional
    public ScoreSaveResponse saveMusicXml(
            String scoreId, byte[] body, String contentType, String ifMatch, boolean force) {
        // Khóa dòng ngay từ đầu để hai lần lưu cùng lúc được xếp hàng và không cùng ra một version
        Score score = scoreRepository
                .findByIdForUpdate(scoreId)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanEdit(score);

        if (body == null || body.length == 0 || body.length > maxMusicXmlBytes) {
            throw new AppException(ErrorCode.FILE_TOO_LARGE);
        }
        requireXmlContentType(contentType);
        if (aiTaskRepository.existsByScoreIdAndTaskTypeAndStatusIn(
                scoreId, AiTaskType.OMR_CONVERSION, ACTIVE_STATUSES)) {
            throw new AppException(ErrorCode.SCORE_BUSY);
        }

        List<ScoreFile> xmlFiles = new ArrayList<>(
                scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MUSICXML));
        int currentVersion = currentVersionOf(score, xmlFiles);

        MusicXmlSummary summary = MusicXmlInspector.inspect(body);

        if (force) {
            // Ghi đè bản mới hơn của người khác: chỉ chủ sở hữu hoặc ADMIN
            if (!scoreFileService.canDelete(score)) {
                throw new AppException(ErrorCode.UNAUTHORIZED);
            }
        } else {
            Integer expected = parseIfMatch(ifMatch);
            if (expected == null || expected != currentVersion) {
                throw new AppException(ErrorCode.SCORE_VERSION_CONFLICT, new ScoreVersionConflict(currentVersion));
            }
        }

        int newVersion = currentVersion + 1;
        String storagePath = "scores/%s/musicxml/v%d.musicxml".formatted(scoreId, newVersion);
        List<String> pathsToDeleteAfterCommit = new ArrayList<>();
        registerFileCleanup(storagePath, pathsToDeleteAfterCommit);
        writeAtomically(storagePath, body);

        // Bản cũ hết là hiện hành, thêm dòng cho bản mới
        List<ScoreFile> changed = new ArrayList<>();
        for (ScoreFile old : xmlFiles) {
            if (!Boolean.FALSE.equals(old.getIsCurrent())) {
                old.setIsCurrent(false);
                changed.add(old);
            }
        }
        ScoreFile created = ScoreFile.builder()
                .score(score)
                .fileType(FileType.MUSICXML)
                .originalFileName("v%d.musicxml".formatted(newVersion))
                .storagePath(storagePath)
                .contentType(MUSICXML_CONTENT_TYPE)
                .sizeBytes((long) body.length)
                .version(newVersion)
                .isCurrent(true)
                .meta(buildMeta(summary))
                .build();
        if (!changed.isEmpty()) {
            scoreFileRepository.saveAll(changed);
        }
        scoreFileRepository.save(created);

        LocalDateTime now = LocalDateTime.now();
        score.setCurrentVersion(newVersion);
        score.setMeasureCount(summary.measureCount());
        score.setKeySignature(summary.keySignature());
        score.setTimeSignature(summary.timeSignature());
        score.setTempoBpm(summary.tempoBpm());
        score.setStaffCount(summary.staffCount());
        score.setUpdatedAt(now);
        scoreRepository.save(score);

        pruneOldVersions(scoreId, xmlFiles, created, pathsToDeleteAfterCommit);

        return ScoreSaveResponse.builder()
                .version(newVersion)
                .measureCount(summary.measureCount())
                .keySignature(summary.keySignature())
                .timeSignature(summary.timeSignature())
                .tempoBpm(summary.tempoBpm())
                .updatedAt(now)
                .build();
    }

    // ---------------------------------------------------------------- kiểm tra đầu vào

    /** Content-Type phải là một trong ba kiểu XML được chấp nhận; tham số như charset được bỏ qua. */
    private void requireXmlContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }
        try {
            MediaType mediaType = MediaType.parseMediaType(contentType);
            String type = (mediaType.getType() + "/" + mediaType.getSubtype()).toLowerCase();
            if (!ACCEPTED_CONTENT_TYPES.contains(type)) {
                throw new AppException(ErrorCode.MUSICXML_INVALID);
            }
        } catch (InvalidMediaTypeException e) {
            throw new AppException(ErrorCode.MUSICXML_INVALID);
        }
    }

    /** Version hiện hành: lấy giá trị lớn hơn giữa scores.current_version và version của MusicXML hiện hành. */
    private int currentVersionOf(Score score, List<ScoreFile> xmlFiles) {
        int fromFiles = xmlFiles.stream()
                .filter(f -> !Boolean.FALSE.equals(f.getIsCurrent()))
                .mapToInt(this::versionOf)
                .max()
                .orElseThrow(() -> new AppException(ErrorCode.MUSICXML_NOT_READY));
        int fromScore = score.getCurrentVersion() == null ? 0 : score.getCurrentVersion();
        return Math.max(fromFiles, fromScore);
    }

    /** Đọc version từ If-Match; trả null nếu thiếu hoặc sai định dạng. */
    static Integer parseIfMatch(String ifMatch) {
        if (ifMatch == null) {
            return null;
        }
        Matcher matcher = IF_MATCH_PATTERN.matcher(ifMatch.trim());
        return matcher.matches() ? Integer.valueOf(matcher.group(1)) : null;
    }

    private int versionOf(ScoreFile file) {
        return file.getVersion() == null ? 1 : file.getVersion();
    }

    // ---------------------------------------------------------------- ghi file và dọn dẹp

    /** Ghi ra file tạm cạnh đích rồi đổi tên để không bao giờ có file ghi dở ở đường dẫn chính thức. */
    private void writeAtomically(String storagePath, byte[] body) {
        Path target = fileStorageService.resolve(storagePath);
        Path temp = target.resolveSibling(target.getFileName() + ".tmp");
        try {
            Files.createDirectories(target.getParent());
            Files.write(temp, body);
            try {
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            log.error("Không ghi được MusicXML {}", target, e);
            try {
                Files.deleteIfExists(temp);
            } catch (IOException ignored) {
                // Chỉ là file tạm, bỏ qua
            }
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
    }

    /**
     * Đăng ký dọn file theo kết quả transaction: rollback thì xóa file mới ghi; commit thì xóa các file của version đã
     * bị loại (danh sách được điền sau). Lỗi xóa file chỉ ghi log. Ngoài transaction (ví dụ test) thì không đăng ký.
     */
    private void registerFileCleanup(String newPath, List<String> pathsToDeleteAfterCommit) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                List<String> toDelete = status == STATUS_COMMITTED ? pathsToDeleteAfterCommit : List.of(newPath);
                for (String path : toDelete) {
                    try {
                        fileStorageService.delete(path);
                    } catch (RuntimeException e) {
                        log.warn("Không xóa được file {}: {}", path, e.getMessage());
                    }
                }
            }
        });
    }

    /**
     * Chỉ giữ {@value #MAX_KEPT_VERSIONS} version MusicXML mới nhất: xóa dòng cũ hơn và các MIDI có version nhỏ hơn
     * version cũ nhất còn giữ; đường dẫn file được đưa vào danh sách để xóa sau khi commit.
     */
    private void pruneOldVersions(
            String scoreId, List<ScoreFile> existing, ScoreFile created, List<String> pathsToDeleteAfterCommit) {
        List<ScoreFile> all = new ArrayList<>(existing);
        all.add(created);
        all.sort(Comparator.comparingInt(this::versionOf).reversed());
        if (all.size() <= MAX_KEPT_VERSIONS) {
            return;
        }
        List<ScoreFile> dropped = all.subList(MAX_KEPT_VERSIONS, all.size());
        int oldestKept = versionOf(all.get(MAX_KEPT_VERSIONS - 1));

        List<ScoreFile> rowsToDelete = new ArrayList<>(dropped);
        scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MIDI).stream()
                .filter(midi -> versionOf(midi) < oldestKept)
                .forEach(rowsToDelete::add);

        scoreFileRepository.deleteAll(rowsToDelete);
        for (ScoreFile row : rowsToDelete) {
            if (!row.getStoragePath().equals(created.getStoragePath())) {
                pathsToDeleteAfterCommit.add(row.getStoragePath());
            }
        }
    }

    private String buildMeta(MusicXmlSummary summary) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("savedBy", SecurityUtils.getCurrentEmail());
        meta.put("measureCount", summary.measureCount());
        try {
            return JSON.writeValueAsString(meta);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}
