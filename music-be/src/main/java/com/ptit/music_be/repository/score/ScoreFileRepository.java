package com.ptit.music_be.repository.score;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.entity.ScoreFile;

@Repository
public interface ScoreFileRepository extends JpaRepository<ScoreFile, String> {

    List<ScoreFile> findByScoreIdOrderByFileTypeAscPageNumberAsc(String scoreId);

    List<ScoreFile> findByScoreIdAndFileTypeOrderByPageNumberAsc(String scoreId, FileType fileType);

    /** Lấy ảnh trang 1 của nhiều bản nhạc một lượt để làm ảnh đại diện (tránh N+1 query). */
    List<ScoreFile> findByScoreIdInAndFileTypeInAndPageNumber(
            Collection<String> scoreIds, Collection<FileType> fileTypes, Integer pageNumber);

    /** Tìm file theo đường dẫn lưu trữ (callback ghi lại cùng một trang thì cập nhật, không thêm dòng trùng). */
    Optional<ScoreFile> findByScoreIdAndStoragePath(String scoreId, String storagePath);

    /** Bản nhạc đã có MusicXML hiện hành do một task khác (không phải {@code taskId}) tạo ra chưa. */
    @Query("select count(f) > 0 from ScoreFile f where f.score.id = :scoreId and f.fileType = :fileType"
            + " and (f.isCurrent is null or f.isCurrent = true)"
            + " and (f.sourceTaskId is null or f.sourceTaskId <> :taskId)")
    boolean existsCurrentFileFromOtherTask(
            @Param("scoreId") String scoreId, @Param("fileType") FileType fileType, @Param("taskId") String taskId);

    /** File của bản nhạc thuộc các loại cho trước (danh sách file xuất). */
    List<ScoreFile> findByScoreIdAndFileTypeIn(String scoreId, Collection<FileType> fileTypes);

    /**
     * File xuất cần dọn: không còn là bản hiện hành, hoặc đã lỗi thời (version nhỏ hơn MusicXML hiện hành của bản
     * nhạc) và tạo trước mốc {@code cutoff}.
     */
    @Query("select f from ScoreFile f where f.fileType in :types and f.sourceTaskId is not null"
            + " and (f.isCurrent = false or (f.version < f.score.currentVersion and f.createdAt < :cutoff))")
    List<ScoreFile> findStaleExportFiles(
            @Param("types") Collection<FileType> types, @Param("cutoff") java.time.LocalDateTime cutoff);
}
