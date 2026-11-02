package com.ptit.music_be.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.response.ScoreFileResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.ScoreFileMapper;
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
    ScoreFileRepository scoreFileRepository;
    ScoreFileMapper scoreFileMapper;
    FileStorageService fileStorageService;

    @Override
    @Transactional(readOnly = true)
    public List<ScoreFileResponse> getFilesOfScore(String scoreId) {
        Score score = scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        checkCanView(score);
        return scoreFileMapper.toResponses(scoreFileRepository.findByScoreIdOrderByFileTypeAscPageNumberAsc(scoreId));
    }

    @Override
    @Transactional(readOnly = true)
    public DownloadableFile loadForDownload(String fileId) {
        ScoreFile scoreFile =
                scoreFileRepository.findById(fileId).orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_EXISTED));
        checkCanView(scoreFile.getScore());

        String fileName = scoreFile.getOriginalFileName() != null
                ? scoreFile.getOriginalFileName()
                : scoreFile.getStoragePath().substring(scoreFile.getStoragePath().lastIndexOf('/') + 1);
        String contentType =
                scoreFile.getContentType() != null ? scoreFile.getContentType() : "application/octet-stream";

        return new DownloadableFile(
                fileStorageService.loadAsResource(scoreFile.getStoragePath()), fileName, contentType);
    }

    @Override
    public void checkCanView(Score score) {
        if (VISIBILITY_PUBLIC.equals(score.getVisibility()) || SecurityUtils.isAdmin()) {
            return;
        }
        String email = SecurityUtils.getCurrentEmail();
        if (score.getMember() == null || !email.equals(score.getMember().getEmail())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }
}
