package com.ptit.music_be.service;

import java.util.List;

import org.springframework.core.io.Resource;

import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.dto.response.ScoreFileResponse;
import com.ptit.music_be.entity.Score;

public interface ScoreFileService {

    /** Danh sách file của bản nhạc; {@code type} khác null thì chỉ lấy đúng loại file đó. */
    List<ScoreFileResponse> getFilesOfScore(String scoreId, FileType type);

    DownloadableFile loadForDownload(String fileId);

    /** Throws UNAUTHORIZED unless the current member can view the score (see {@link #canView}). */
    void checkCanView(Score score);

    /** Throws UNAUTHORIZED unless the current member can edit the score (see {@link #canEdit}). */
    void checkCanEdit(Score score);

    /**
     * Xem được nếu: score PUBLIC, hoặc là ADMIN, hoặc là chủ sở hữu, hoặc được chia sẻ (có dòng trong
     * member_scores, quyền VIEW hay EDIT đều xem được).
     */
    boolean canView(Score score);

    /**
     * Sửa được nếu là ADMIN; hoặc (score không phải bản chính thức và (là chủ sở hữu hoặc được chia sẻ quyền
     * EDIT)). Bản chính thức (is_official = true) chỉ ADMIN được sửa.
     */
    boolean canEdit(Score score);

    /** Xóa được nếu là ADMIN hoặc chủ sở hữu (người được chia sẻ EDIT không được xóa). */
    boolean canDelete(Score score);

    record DownloadableFile(Resource resource, String fileName, String contentType) {}
}
