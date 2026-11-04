package com.ptit.music_be.service.impl;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.FileType;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.FileStorageService;
import com.ptit.music_be.service.ScoreContentService;
import com.ptit.music_be.service.ScoreFileService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ScoreContentServiceImpl implements ScoreContentService {

    ScoreRepository scoreRepository;
    ScoreFileRepository scoreFileRepository;
    ScoreFileService scoreFileService;
    FileStorageService fileStorageService;

    @Override
    @Transactional(readOnly = true)
    public String getKern(String scoreId) {
        Score score =
                scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);

        ScoreFile kern =
                scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.KERN).stream()
                        .filter(f -> !Boolean.FALSE.equals(f.getIsCurrent()))
                        .findFirst()
                        .orElseThrow(() -> new AppException(ErrorCode.FILE_NOT_EXISTED));

        Path onDisk = fileStorageService.resolve(kern.getStoragePath());
        if (!Files.isRegularFile(onDisk)) {
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
        try {
            return Files.readString(onDisk, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Không đọc được file kern {}", onDisk, e);
            throw new AppException(ErrorCode.FILE_NOT_EXISTED);
        }
    }
}
