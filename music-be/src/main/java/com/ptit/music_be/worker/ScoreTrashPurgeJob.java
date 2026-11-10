package com.ptit.music_be.worker;

import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.ptit.music_be.service.ScoreTrashService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Mỗi đêm xóa hẳn các bản nhạc nằm trong thùng rác quá {@code score.trash.retention-days} ngày. Mỗi bản một
 * transaction, lỗi bản nào chỉ ghi log bản đó và đi tiếp.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ScoreTrashPurgeJob {

    private final ScoreTrashService scoreTrashService;

    @Scheduled(cron = "${score.trash.purge-cron:0 30 3 * * *}")
    public void purgeExpired() {
        List<String> ids = scoreTrashService.findExpiredIds();
        if (ids.isEmpty()) {
            return;
        }
        int purged = 0;
        for (String id : ids) {
            try {
                scoreTrashService.purgeExpired(id);
                purged++;
            } catch (RuntimeException e) {
                log.warn("Không xóa hẳn được bản nhạc {} trong thùng rác: {}", id, e.getMessage());
            }
        }
        log.info("Thùng rác: đã xóa hẳn {}/{} bản nhạc quá hạn", purged, ids.size());
    }
}
