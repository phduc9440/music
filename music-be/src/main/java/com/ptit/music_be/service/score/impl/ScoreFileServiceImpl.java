package com.ptit.music_be.service.score.impl;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.response.score.ScoreFileResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.ScoreFileMapper;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.storage.FileStorageService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScoreFileServiceImpl implements ScoreFileService {

    /** File gốc người dùng đưa vào và file trung gian của OMR: chỉ người có quyền sửa được thấy và tải. */
    static final Set<FileType> SOURCE_FILE_TYPES = EnumSet.of(
            FileType.ORIGINAL_PDF,
            FileType.ORIGINAL_IMAGE,
            FileType.ORIGINAL_MUSICXML,
            FileType.ORIGINAL_MIDI,
            FileType.KERN,
            FileType.PNG);

    /** Ảnh trang 1 được phép hiện inline cho người xem để làm ảnh đại diện bản nhạc. */
    private static final Set<FileType> THUMBNAIL_FILE_TYPES = EnumSet.of(FileType.PNG, FileType.ORIGINAL_IMAGE);

    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    ScoreFileMapper scoreFileMapper;
    FileStorageService fileStorageService;
    ScorePermissionService permissionService;

    @Override
    @Transactional(readOnly = true)
    public List<ScoreFileResponse> getFilesOfScore(String scoreId, FileType type) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.VIEW)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        // Có type thì lọc theo loại, không thì lấy tất cả (sắp xếp theo loại rồi số trang)
        List<ScoreFile> files = type == null
                ? scoreFileRepository.findByScoreIdOrderByFileTypeAscPageNumberAsc(scoreId)
                : scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, type);
        if (!decision.can(ScoreAccess.EDIT)) {
            files = files.stream()
                    .filter(f -> !SOURCE_FILE_TYPES.contains(f.getFileType()))
                    .toList();
        }
        return scoreFileMapper.toResponses(files);
    }

    @Override
    @Transactional(readOnly = true)
    public DownloadableFile loadForDownload(String fileId) {
        return loadForDownload(fileId, false);
    }

    @Override
    @Transactional(readOnly = true)
    public DownloadableFile loadForDownload(String fileId, boolean inline) {
        ScoreFile scoreFile =
                scoreFileRepository.findById(fileId).orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_EXISTED));
        Score score = scoreFile.getScore();
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.VIEW)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        if (!canDownloadFile(score, scoreFile, decision, inline)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        String fileName = scoreFile.getOriginalFileName() != null
                ? scoreFile.getOriginalFileName()
                : scoreFile
                        .getStoragePath()
                        .substring(scoreFile.getStoragePath().lastIndexOf('/') + 1);
        String contentType =
                scoreFile.getContentType() != null ? scoreFile.getContentType() : "application/octet-stream";

        return new DownloadableFile(
                fileStorageService.loadAsResource(scoreFile.getStoragePath()), fileName, contentType);
    }

    /**
     * File gốc / kern / ảnh trang cần quyền sửa (riêng ảnh trang 1 hiện inline cho mọi người xem làm ảnh đại diện). Các
     * file còn lại (MusicXML, MIDI, âm thanh, PDF, SVG) cần quyền sửa, hoặc quyền xem khi chủ đã bật cho tải.
     */
    private static boolean canDownloadFile(Score score, ScoreFile file, AccessDecision decision, boolean inline) {
        if (decision.can(ScoreAccess.EDIT)) {
            return true;
        }
        if (SOURCE_FILE_TYPES.contains(file.getFileType())) {
            return inline
                    && THUMBNAIL_FILE_TYPES.contains(file.getFileType())
                    && Integer.valueOf(1).equals(file.getPageNumber());
        }
        return score.isAllowDownload();
    }

    @Override
    public void checkCanView(Score score) {
        if (!canView(score)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    @Override
    public void checkCanEdit(Score score) {
        if (!canEdit(score)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    @Override
    public boolean canView(Score score) {
        return permissionService.resolve(score).can(ScoreAccess.VIEW);
    }

    @Override
    public boolean canEdit(Score score) {
        return permissionService.canEdit(score);
    }

    @Override
    public boolean canReview(Score score) {
        return permissionService.resolve(score).can(ScoreAccess.REVIEW);
    }

    @Override
    public void checkCanReview(Score score) {
        if (!canReview(score)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    @Override
    public boolean canManageSharing(Score score) {
        return permissionService.resolve(score).can(ScoreAccess.OWNER);
    }

    @Override
    public void checkCanManageSharing(Score score) {
        if (!canManageSharing(score)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    @Override
    public boolean canDownload(Score score) {
        AccessDecision decision = permissionService.resolve(score);
        return decision.can(ScoreAccess.EDIT) || (decision.can(ScoreAccess.VIEW) && score.isAllowDownload());
    }

    @Override
    public void checkCanDownload(Score score) {
        if (!canDownload(score)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    @Override
    public boolean canDelete(Score score) {
        return permissionService.canDelete(score);
    }

    @Override
    public String getAccessLevel(Score score) {
        ScoreAccess level = permissionService.resolve(score).level();
        return level == ScoreAccess.NONE ? null : level.name();
    }
}
