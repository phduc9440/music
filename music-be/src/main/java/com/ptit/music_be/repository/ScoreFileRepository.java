package com.ptit.music_be.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.entity.ScoreFile;

@Repository
public interface ScoreFileRepository extends JpaRepository<ScoreFile, String> {

    List<ScoreFile> findByScoreIdOrderByFileTypeAscPageNumberAsc(String scoreId);

    List<ScoreFile> findByScoreIdAndFileTypeOrderByPageNumberAsc(String scoreId, FileType fileType);

    /** Lấy ảnh trang 1 của nhiều bản nhạc một lượt để làm ảnh đại diện (tránh N+1 query). */
    List<ScoreFile> findByScoreIdInAndFileTypeInAndPageNumber(
            Collection<String> scoreIds, Collection<FileType> fileTypes, Integer pageNumber);
}
