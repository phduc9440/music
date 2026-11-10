package com.ptit.music_be.service.impl;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.enums.SharePermission;
import com.ptit.music_be.dto.response.ScoreFileResponse;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.ScoreFileMapper;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.ScoreFileService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScoreFileServiceImpl implements ScoreFileService {

    static final String VISIBILITY_PUBLIC = "PUBLIC";

    ScoreRepository scoreRepository;
    MemberScoreRepository memberScoreRepository;
    ScoreFileRepository scoreFileRepository;
    ScoreFileMapper scoreFileMapper;
    FileStorageService fileStorageService;

    @Override
    @Transactional(readOnly = true)
    public List<ScoreFileResponse> getFilesOfScore(String scoreId, FileType type) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        checkCanView(score);
        // Có type thì lọc theo loại, không thì lấy tất cả (sắp xếp theo loại rồi số trang)
        List<ScoreFile> files = type == null
                ? scoreFileRepository.findByScoreIdOrderByFileTypeAscPageNumberAsc(scoreId)
                : scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, type);
        return scoreFileMapper.toResponses(files);
    }

    @Override
    @Transactional(readOnly = true)
    public DownloadableFile loadForDownload(String fileId) {
        ScoreFile scoreFile =
                scoreFileRepository.findById(fileId).orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_EXISTED));
        checkCanView(scoreFile.getScore());

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
    @Transactional(readOnly = true)
    public boolean canView(Score score) {
        if (VISIBILITY_PUBLIC.equals(score.getVisibility()) || SecurityUtils.isAdmin()) {
            return true;
        }
        if (isOwner(score)) {
            return true;
        }
        // Được chia sẻ (quyền VIEW hoặc EDIT) cũng xem được
        return findShare(score).isPresent();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean canEdit(Score score) {
        // SUPER_ADMIN sửa được mọi bản nhạc, kể cả của người khác
        if (SecurityUtils.isSuperAdmin()) {
            return true;
        }
        // Bản chính thức (kho score mẫu): chỉ ADMIN được sửa
        if (Boolean.TRUE.equals(score.getIsOfficial())) {
            return SecurityUtils.isAdmin();
        }
        // ADMIN thường không có quyền sửa nội dung bản của người khác (chỉ kiểm duyệt: xem, đổi công khai, xóa);
        // vẫn sửa được bản của chính mình hoặc bản được chia sẻ quyền sửa như người dùng thường
        if (isOwner(score)) {
            return true;
        }
        return hasShare(score, SharePermission.EDIT);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean canReview(Score score) {
        return SecurityUtils.isAdmin()
                || isOwner(score)
                || VISIBILITY_PUBLIC.equals(score.getVisibility()) // bản công khai: ai đăng nhập cũng nhận xét được
                || hasShare(score, SharePermission.REVIEW);
    }

    @Override
    public void checkCanReview(Score score) {
        if (!canReview(score)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    @Override
    public boolean canManageSharing(Score score) {
        // Chia sẻ, duyệt yêu cầu truy cập: chủ sở hữu hoặc SUPER_ADMIN. ADMIN thường không chia sẻ bản của người khác
        // (việc kiểm duyệt công khai của admin đi qua AdminScoreController/approve/reject, không qua hàm này)
        return SecurityUtils.isSuperAdmin() || isOwner(score);
    }

    @Override
    public void checkCanManageSharing(Score score) {
        if (!canManageSharing(score)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public String getAccessLevel(Score score) {
        if (canManageSharing(score)) {
            return "OWNER";
        }
        SharePermission shared =
                findShare(score).map(MemberScore::getPermission).orElse(null);
        // Bản công khai cho mọi người quyền nhận xét (gồm xem); quyền được chia sẻ cao hơn thì giữ
        if (VISIBILITY_PUBLIC.equals(score.getVisibility())
                && (shared == null || !shared.includes(SharePermission.REVIEW))) {
            return SharePermission.REVIEW.name();
        }
        return shared == null ? null : shared.name();
    }

    private boolean hasShare(Score score, SharePermission atLeast) {
        return findShare(score)
                .map(share -> share.getPermission().includes(atLeast))
                .orElse(false);
    }

    @Override
    public boolean canDelete(Score score) {
        return SecurityUtils.isAdmin() || isOwner(score);
    }

    private boolean isOwner(Score score) {
        return score.getMember() != null
                && SecurityUtils.getCurrentEmail().equals(score.getMember().getEmail());
    }

    /** Quyền đã được cấp cho người đang đăng nhập. Dòng mới chỉ có yêu cầu xin (permission null) thì chưa có quyền. */
    private Optional<MemberScore> findShare(Score score) {
        return memberScoreRepository
                .findByScoreIdAndMemberEmail(score.getId(), SecurityUtils.getCurrentEmail())
                .filter(share -> share.getPermission() != null);
    }
}
