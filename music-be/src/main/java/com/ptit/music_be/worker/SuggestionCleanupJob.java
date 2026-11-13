package com.ptit.music_be.worker;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.ptit.music_be.service.score.SuggestionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Mỗi đêm xóa file MusicXML của các đề xuất sửa đã đóng quá 30 ngày; dòng DB được giữ để lịch sử phiên bản còn tên người
 * đề xuất. Lỗi chỉ ghi log, lần chạy sau thử lại.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SuggestionCleanupJob {

    private final SuggestionService suggestionService;

    @Scheduled(cron = "${score.suggestion.cleanup-cron:0 30 3 * * *}")
    public void cleanup() {
        try {
            int cleaned = suggestionService.cleanupClosedFiles();
            if (cleaned > 0) {
                log.info("Đề xuất sửa: đã dọn file của {} đề xuất đã đóng quá hạn", cleaned);
            }
        } catch (RuntimeException e) {
            log.error("Job dọn file đề xuất sửa gặp lỗi", e);
        }
    }
}
