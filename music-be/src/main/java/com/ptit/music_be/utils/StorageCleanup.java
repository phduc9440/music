package com.ptit.music_be.utils;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.ptit.music_be.service.storage.FileStorageService;

import lombok.extern.slf4j.Slf4j;

/** Dọn file đã ghi ra đĩa khi transaction đang chạy bị hoàn tác, để không để lại file mồ côi. */
@Slf4j
public final class StorageCleanup {

    private StorageCleanup() {}

    /**
     * Xóa thư mục {@code relativeDir} nếu transaction hiện tại không commit. Ngoài transaction (ví dụ test) thì không
     * đăng ký gì.
     */
    public static void deleteDirectoryOnRollback(FileStorageService storage, String relativeDir) {
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
                    storage.deleteDirectory(relativeDir);
                } catch (RuntimeException e) {
                    log.warn("Không dọn được thư mục {}: {}", relativeDir, e.getMessage());
                }
            }
        });
    }
}
