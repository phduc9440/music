package com.ptit.music_be.worker;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Stream;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.ptit.music_be.entity.ScoreFile;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.service.export.impl.ExportServiceImpl;
import com.ptit.music_be.service.storage.FileStorageService;

import lombok.extern.slf4j.Slf4j;

/**
 * Dọn file xuất mỗi đêm (đặc tả 5.2): file xuất không còn là bản hiện hành, hoặc đã lỗi thời quá 7 ngày, và thư mục
 * {@code tmp/} cũ hơn 1 giờ (còn sót khi máy chủ tắt giữa chừng). Xóa dòng DB trong transaction, xóa file sau khi commit.
 */
@Component
@Slf4j
public class ExportCleanupJob {

    static final int OUTDATED_DAYS = 7;
    static final int TMP_MAX_AGE_HOURS = 1;

    private final ScoreFileRepository scoreFileRepository;
    private final FileStorageService fileStorageService;
    private final TransactionTemplate tx;

    public ExportCleanupJob(
            ScoreFileRepository scoreFileRepository,
            FileStorageService fileStorageService,
            PlatformTransactionManager transactionManager) {
        this.scoreFileRepository = scoreFileRepository;
        this.fileStorageService = fileStorageService;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Scheduled(cron = "${export.cleanup-cron:0 0 3 * * *}")
    public void run() {
        try {
            deleteStaleFiles();
            deleteOldTmpDirs();
        } catch (RuntimeException e) {
            log.error("Job dọn file xuất gặp lỗi", e);
        }
    }

    void deleteStaleFiles() {
        List<String> paths = tx.execute(status -> {
            List<ScoreFile> stale = scoreFileRepository.findStaleExportFiles(
                    ExportServiceImpl.EXPORT_FILE_TYPES, LocalDateTime.now().minusDays(OUTDATED_DAYS));
            List<String> storagePaths =
                    stale.stream().map(ScoreFile::getStoragePath).toList();
            scoreFileRepository.deleteAll(stale);
            return storagePaths;
        });
        if (paths != null) {
            paths.forEach(fileStorageService::delete);
            log.info("Đã dọn {} file xuất cũ", paths.size());
        }
    }

    void deleteOldTmpDirs() {
        Path scoresRoot = fileStorageService.resolve("scores");
        if (!Files.isDirectory(scoresRoot)) {
            return;
        }
        Instant limit = Instant.now().minus(TMP_MAX_AGE_HOURS, ChronoUnit.HOURS);
        try (Stream<Path> scores = Files.list(scoresRoot)) {
            for (Path score : scores.toList()) {
                Path tmp = score.resolve("tmp");
                if (!Files.isDirectory(tmp)) {
                    continue;
                }
                try (Stream<Path> tasks = Files.list(tmp)) {
                    for (Path dir : tasks.toList()) {
                        if (Files.getLastModifiedTime(dir).toInstant().isBefore(limit)) {
                            fileStorageService.deleteDirectory(
                                    "scores/" + score.getFileName() + "/tmp/" + dir.getFileName());
                        }
                    }
                }
            }
        } catch (IOException e) {
            log.warn("Không dọn được thư mục tmp: {}", e.getMessage());
        }
    }
}
