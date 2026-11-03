package com.ptit.music_be.service.impl;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.ProcessingStatus;
import com.ptit.music_be.dto.enums.ScoreSource;
import com.ptit.music_be.dto.response.OmrUploadResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.AiTaskMapper;
import com.ptit.music_be.mapper.ScoreFileMapper;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.OmrService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class OmrServiceImpl implements OmrService {

    static final String DEFAULT_VISIBILITY = "PRIVATE";
    static final int MAX_TITLE_LENGTH = 255;

    MemberRepository memberRepository;
    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    AiTaskRepository aiTaskRepository;
    FileStorageService fileStorageService;
    ScoreFileMapper scoreFileMapper;
    AiTaskMapper aiTaskMapper;

    @NonFinal
    @Value("${app.omr.max-images:20}")
    int maxImages;

    @Override
    @Transactional
    public OmrUploadResponse upload(List<MultipartFile> files, String title) {
        List<UploadKind> kinds = validate(files);

        Member member = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        Score score = scoreRepository.save(Score.builder()
                .member(member)
                .title(resolveTitle(title, files.getFirst()))
                .visibility(DEFAULT_VISIBILITY)
                .isOfficial(false)
                .processingStatus(ProcessingStatus.PENDING.name())
                .sourceType(ScoreSource.OMR.name())
                .build());

        String scoreDir = "scores/" + score.getId();
        // If anything below fails, the DB rolls back -> also remove files already written to disk.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    fileStorageService.deleteDirectory(scoreDir);
                }
            }
        });

        boolean isPdf = kinds.getFirst() == UploadKind.PDF;
        List<ScoreFile> savedFiles = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            MultipartFile file = files.get(i);
            UploadKind kind = kinds.get(i);
            String relativePath =
                    String.format("%s/original/%02d-%s.%s", scoreDir, i + 1, UUID.randomUUID(), kind.extension);

            String storedPath;
            try (InputStream in = file.getInputStream()) {
                storedPath = fileStorageService.store(in, relativePath);
            } catch (IOException e) {
                log.error("Cannot read uploaded file {}", file.getOriginalFilename(), e);
                throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
            }

            savedFiles.add(scoreFileRepository.save(ScoreFile.builder()
                    .score(score)
                    .fileType(isPdf ? FileType.ORIGINAL_PDF : FileType.ORIGINAL_IMAGE)
                    .originalFileName(cleanFileName(file.getOriginalFilename()))
                    .storagePath(storedPath)
                    .contentType(kind.contentType)
                    .sizeBytes(file.getSize())
                    .pageNumber(isPdf ? null : i + 1)
                    .build()));
        }

        AiTask task = aiTaskRepository.save(AiTask.builder()
                .member(member)
                .score(score)
                .taskType(AiTaskType.OMR_CONVERSION)
                .status(AiTaskStatus.PENDING)
                .progress(0)
                .build());

        return OmrUploadResponse.builder()
                .scoreId(score.getId())
                .title(score.getTitle())
                .processingStatus(score.getProcessingStatus())
                .task(aiTaskMapper.toResponse(task))
                .files(scoreFileMapper.toResponses(savedFiles))
                .build();
    }

    // ---------------------------------------------------------------- validation

    enum UploadKind {
        PDF("pdf", "application/pdf"),
        PNG("png", "image/png"),
        JPEG("jpg", "image/jpeg");

        final String extension;
        final String contentType;

        UploadKind(String extension, String contentType) {
            this.extension = extension;
            this.contentType = contentType;
        }
    }

    private List<UploadKind> validate(List<MultipartFile> files) {
        if (files == null || files.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_UPLOAD_COMBINATION);
        }

        List<UploadKind> kinds = new ArrayList<>();
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                throw new AppException(ErrorCode.FILE_EMPTY);
            }
            UploadKind byExtension = kindFromExtension(file.getOriginalFilename());
            UploadKind byContent = kindFromMagicBytes(file);
            // Both the extension and the real file content must agree on an allowed type
            if (byExtension == null || byContent == null || byExtension != byContent) {
                throw new AppException(ErrorCode.FILE_TYPE_NOT_SUPPORTED);
            }
            kinds.add(byContent);
        }

        long pdfCount = kinds.stream().filter(k -> k == UploadKind.PDF).count();
        if (pdfCount > 0 && files.size() != 1) {
            throw new AppException(ErrorCode.INVALID_UPLOAD_COMBINATION);
        }
        if (pdfCount == 0 && files.size() > maxImages) {
            throw new AppException(ErrorCode.INVALID_UPLOAD_COMBINATION);
        }
        return kinds;
    }

    private UploadKind kindFromExtension(String fileName) {
        String ext = StringUtils.getFilenameExtension(fileName);
        if (ext == null) {
            return null;
        }
        return switch (ext.toLowerCase(Locale.ROOT)) {
            case "pdf" -> UploadKind.PDF;
            case "png" -> UploadKind.PNG;
            case "jpg", "jpeg" -> UploadKind.JPEG;
            default -> null;
        };
    }

    private UploadKind kindFromMagicBytes(MultipartFile file) {
        byte[] head = new byte[8];
        int read;
        try (InputStream in = file.getInputStream()) {
            read = in.readNBytes(head, 0, head.length);
        } catch (IOException e) {
            return null;
        }
        if (read >= 4 && head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F') {
            return UploadKind.PDF;
        }
        if (read >= 8
                && (head[0] & 0xFF) == 0x89
                && head[1] == 'P'
                && head[2] == 'N'
                && head[3] == 'G'
                && head[4] == 0x0D
                && head[5] == 0x0A
                && head[6] == 0x1A
                && head[7] == 0x0A) {
            return UploadKind.PNG;
        }
        if (read >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF) {
            return UploadKind.JPEG;
        }
        return null;
    }

    // ---------------------------------------------------------------- helpers

    private String resolveTitle(String title, MultipartFile firstFile) {
        String resolved = StringUtils.hasText(title)
                ? title.trim()
                : StringUtils.stripFilenameExtension(cleanFileName(firstFile.getOriginalFilename()));
        if (!StringUtils.hasText(resolved)) {
            resolved = "Untitled score";
        }
        return resolved.length() > MAX_TITLE_LENGTH ? resolved.substring(0, MAX_TITLE_LENGTH) : resolved;
    }

    private String cleanFileName(String originalFileName) {
        if (originalFileName == null) {
            return "";
        }
        String name = StringUtils.getFilename(StringUtils.cleanPath(originalFileName));
        if (name == null) {
            return "";
        }
        return name.length() > MAX_TITLE_LENGTH ? name.substring(name.length() - MAX_TITLE_LENGTH) : name;
    }
}
