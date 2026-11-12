package com.ptit.music_be.service.score.impl;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ptit.music_be.dto.enums.ai.ProcessingStatus;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.dto.enums.score.ScoreSource;
import com.ptit.music_be.dto.enums.score.Visibility;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.entity.ScoreTag;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.score.CopyOptions;
import com.ptit.music_be.service.score.ScoreCopyService;
import com.ptit.music_be.service.storage.FileStorageService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScoreCopyServiceImpl implements ScoreCopyService {

    static final String MUSICXML_CONTENT_TYPE = "application/vnd.recordare.musicxml+xml";

    private final ScoreRepository scoreRepository;
    private final ScoreFileRepository scoreFileRepository;
    private final FileStorageService fileStorageService;

    @Override
    @Transactional
    public Score copy(String sourceScoreId, Member newOwner, CopyOptions options) {
        CopyOptions opts = options == null ? CopyOptions.defaults() : options;
        Score source = scoreRepository
                .findById(sourceScoreId)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        ScoreFile sourceXml = currentMusicXml(sourceScoreId);

        String title = opts.title() == null || opts.title().isBlank()
                ? source.getTitle()
                : opts.title().trim();
        ScoreSource sourceType = opts.sourceType() == null ? ScoreSource.MANUAL : opts.sourceType();
        Score copy = scoreRepository.save(Score.builder()
                .member(newOwner)
                .title(title)
                .composer(opts.keepComposer() ? source.getComposer() : null)
                .difficulty(source.getDifficulty())
                .processingStatus(ProcessingStatus.COMPLETED.name())
                .visibility(Visibility.PRIVATE.name())
                .isOfficial(false)
                .tempoBpm(source.getTempoBpm())
                .measureCount(source.getMeasureCount())
                .keySignature(source.getKeySignature())
                .timeSignature(source.getTimeSignature())
                .staffCount(source.getStaffCount())
                .sourceType(sourceType.name())
                .currentVersion(1)
                .build());

        // Ghi file trước khi lưu dòng score_files; transaction rollback thì xóa thư mục vừa tạo
        String storagePath = "scores/%s/musicxml/v1.musicxml".formatted(copy.getId());
        registerCleanupOnRollback(copy.getId());
        long size = copyFile(sourceXml.getStoragePath(), storagePath);

        scoreFileRepository.save(ScoreFile.builder()
                .score(copy)
                .fileType(FileType.MUSICXML)
                .originalFileName("v1.musicxml")
                .storagePath(storagePath)
                .contentType(MUSICXML_CONTENT_TYPE)
                .sizeBytes(size)
                .version(1)
                .isCurrent(true)
                .meta("{\"measureCount\":%d,\"copiedFrom\":\"%s\"}"
                        .formatted(source.getMeasureCount() == null ? 0 : source.getMeasureCount(), source.getId()))
                .build());

        if (opts.keepTags()) {
            for (ScoreTag tag : source.getScoreTags()) {
                copy.getScoreTags()
                        .add(ScoreTag.builder().score(copy).tag(tag.getTag()).build());
            }
            scoreRepository.save(copy);
        }
        return copy;
    }

    /** MusicXML hiện hành của bản nguồn: dòng is_current (hoặc null) có version lớn nhất. */
    private ScoreFile currentMusicXml(String scoreId) {
        List<ScoreFile> files =
                scoreFileRepository.findByScoreIdAndFileTypeOrderByPageNumberAsc(scoreId, FileType.MUSICXML);
        return files.stream()
                .filter(f -> !Boolean.FALSE.equals(f.getIsCurrent()))
                .max(Comparator.comparingInt(f -> f.getVersion() == null ? 1 : f.getVersion()))
                .orElseThrow(() -> new AppException(ErrorCode.MUSICXML_NOT_READY));
    }

    private long copyFile(String fromPath, String toPath) {
        try (InputStream in = Files.newInputStream(fileStorageService.resolve(fromPath))) {
            fileStorageService.store(in, toPath);
            return Files.size(fileStorageService.resolve(toPath));
        } catch (IOException e) {
            log.error("Không chép được MusicXML từ {} sang {}", fromPath, toPath, e);
            throw new AppException(ErrorCode.FILE_STORAGE_ERROR);
        }
    }

    /** Rollback thì xóa thư mục của bản sao để không để lại file mồ côi. */
    private void registerCleanupOnRollback(String newScoreId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) {
                    return;
                }
                try {
                    fileStorageService.deleteDirectory("scores/" + newScoreId);
                } catch (RuntimeException e) {
                    log.warn("Không dọn được thư mục bản sao {}: {}", newScoreId, e.getMessage());
                }
            }
        });
    }
}
