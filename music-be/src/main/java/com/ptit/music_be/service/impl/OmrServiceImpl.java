package com.ptit.music_be.service.impl;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;
import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.OmrSourceType;
import com.ptit.music_be.dto.enums.ProcessingStatus;
import com.ptit.music_be.dto.enums.ScoreSource;
import com.ptit.music_be.dto.response.OmrUploadResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.event.OmrTaskCreatedEvent;
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
    static final int MAX_COMPOSER_LENGTH = 255;
    /** Tác vụ OMR "đang chạy" = còn chờ hoặc đang xử lý; dùng để giới hạn số task mỗi người. */
    static final List<AiTaskStatus> ACTIVE_STATUSES = List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING);

    MemberRepository memberRepository;
    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    AiTaskRepository aiTaskRepository;
    FileStorageService fileStorageService;
    ScoreFileMapper scoreFileMapper;
    AiTaskMapper aiTaskMapper;
    ObjectMapper objectMapper;
    ApplicationEventPublisher eventPublisher;

    @NonFinal
    @Value("${app.omr.max-images:20}")
    int maxImages;

    @NonFinal
    @Value("${app.omr.max-pdf-pages:20}")
    int maxPdfPages;

    /** Cạnh ngắn tối thiểu của ảnh (px). */
    @NonFinal
    @Value("${app.omr.min-image-side:600}")
    int minImageSide;

    /** Số điểm ảnh tối đa của một ảnh (40 megapixel). */
    @NonFinal
    @Value("${app.omr.max-image-pixels:40000000}")
    long maxImagePixels;

    /** Mỗi người tối đa bấy nhiêu task OMR PENDING/PROCESSING cùng lúc. */
    @NonFinal
    @Value("${app.omr.max-active-tasks:3}")
    int maxActiveTasks;

    @Override
    @Transactional
    public OmrUploadResponse upload(List<MultipartFile> files, String title, String composer, String sourceType) {
        // Kiểm tra rẻ trước (tham số chữ), rồi mới đọc nội dung file
        String cleanComposer = resolveComposer(composer);
        List<UploadKind> kinds = validate(files);
        boolean isPdf = kinds.getFirst() == UploadKind.PDF;
        OmrSourceType resolvedSourceType = resolveSourceType(sourceType, isPdf);
        int pageCount = isPdf ? inspectPdf(files.getFirst()) : inspectImages(files);

        Member member = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));

        long activeTasks = aiTaskRepository.countByMemberIdAndTaskTypeAndStatusIn(
                member.getId(), AiTaskType.OMR_CONVERSION, ACTIVE_STATUSES);
        if (activeTasks >= maxActiveTasks) {
            throw new AppException(ErrorCode.TASK_LIMIT_EXCEEDED);
        }

        Score score = scoreRepository.save(Score.builder()
                .member(member)
                .title(resolveTitle(title, files.getFirst()))
                .composer(cleanComposer)
                .visibility(DEFAULT_VISIBILITY)
                .isOfficial(false)
                .processingStatus(ProcessingStatus.PENDING.name())
                .sourceType(ScoreSource.OMR.name())
                .pageCount(pageCount)
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
                .inputData(buildInputData(resolvedSourceType))
                .build());

        // Bộ điều phối (nhánh feature/omr-preprocess) chỉ gửi task sang music-ai sau khi transaction commit
        eventPublisher.publishEvent(new OmrTaskCreatedEvent(task.getId(), score.getId()));

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

    /** Mở PDF bằng PDFBox: không mã hóa/đặt mật khẩu, mở được, 1..maxPdfPages trang. Trả về số trang. */
    private int inspectPdf(MultipartFile file) {
        int pages;
        try (InputStream in = file.getInputStream();
                PDDocument document = Loader.loadPDF(new RandomAccessReadBuffer(in))) {
            if (document.isEncrypted()) {
                throw new AppException(ErrorCode.PDF_ENCRYPTED);
            }
            pages = document.getNumberOfPages();
        } catch (InvalidPasswordException e) {
            throw new AppException(ErrorCode.PDF_ENCRYPTED);
        } catch (IOException e) {
            log.warn("Cannot open uploaded PDF {}: {}", file.getOriginalFilename(), e.getMessage());
            throw new AppException(ErrorCode.PDF_ENCRYPTED);
        }
        if (pages < 1 || pages > maxPdfPages) {
            throw new AppException(ErrorCode.PDF_TOO_MANY_PAGES);
        }
        return pages;
    }

    /**
     * Đọc kích thước từng ảnh (chỉ đọc header, không giải mã cả ảnh): cạnh ngắn >= minImageSide và tổng điểm ảnh <=
     * maxImagePixels. Trả về số trang (= số ảnh).
     */
    private int inspectImages(List<MultipartFile> files) {
        for (MultipartFile file : files) {
            long[] size = readImageSize(file);
            if (size == null) {
                throw new AppException(ErrorCode.IMAGE_RESOLUTION_INVALID);
            }
            long width = size[0];
            long height = size[1];
            if (Math.min(width, height) < minImageSide || width * height > maxImagePixels) {
                throw new AppException(ErrorCode.IMAGE_RESOLUTION_INVALID);
            }
        }
        return files.size();
    }

    /** {width, height} hoặc null nếu không đọc được. */
    private long[] readImageSize(MultipartFile file) {
        try (InputStream in = file.getInputStream();
                ImageInputStream iis = ImageIO.createImageInputStream(in)) {
            if (iis == null) {
                return null;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true, true);
                return new long[] {reader.getWidth(0), reader.getHeight(0)};
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Cannot read uploaded image {}: {}", file.getOriginalFilename(), e.getMessage());
            return null;
        }
    }

    private OmrSourceType resolveSourceType(String sourceType, boolean isPdf) {
        if (!StringUtils.hasText(sourceType)) {
            return isPdf ? OmrSourceType.PDF_NATIVE : OmrSourceType.PHOTO;
        }
        try {
            return OmrSourceType.valueOf(sourceType.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new AppException(ErrorCode.INVALID_SOURCE_TYPE);
        }
    }

    private String resolveComposer(String composer) {
        if (!StringUtils.hasText(composer)) {
            return null;
        }
        String trimmed = composer.trim();
        if (trimmed.length() > MAX_COMPOSER_LENGTH) {
            throw new AppException(ErrorCode.SCORE_COMPOSER_INVALID);
        }
        return trimmed;
    }

    /** input_data của task OMR, ví dụ {"sourceType":"PHOTO","preprocess":true}. */
    private String buildInputData(OmrSourceType sourceType) {
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("sourceType", sourceType.name());
        input.put("preprocess", true);
        try {
            return objectMapper.writeValueAsString(input);
        } catch (JsonProcessingException e) {
            throw new AppException(ErrorCode.UNCATEGORIZED_EXCEPTION);
        }
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
