package com.ptit.music_be.service.storage;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

/** Dọn file của một bản nhạc trên đĩa. Chỉ xóa sau khi transaction commit để rollback không làm mất file. */
@Component
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class ScoreStorageCleaner {

    FileStorageService fileStorageService;

    /** Xóa thư mục {@code scores/{scoreId}} sau khi transaction hiện tại commit (xóa ngay nếu không có transaction). */
    public void deleteScoreDirAfterCommit(String scoreId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteNow(scoreId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteNow(scoreId);
            }
        });
    }

    private void deleteNow(String scoreId) {
        try {
            fileStorageService.deleteDirectory("scores/" + scoreId);
        } catch (RuntimeException e) {
            // Dòng DB đã xóa rồi; file mồ côi chỉ tốn chỗ, không được làm hỏng luồng chính
            log.warn("Không dọn được thư mục của bản nhạc {}: {}", scoreId, e.getMessage());
        }
    }
}
