package com.ptit.music_be.worker;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.ptit.music_be.service.collab.live.LiveCollabService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Việc nền của đồng chỉnh sửa (mục 4.4): mỗi 5 giây bỏ người mất nhịp tim, bỏ khóa hết hạn và lưu các phiên đã yên 30
 * giây thành version mới; mỗi đêm xóa nhật ký thao tác quá 7 ngày. Lỗi chỉ ghi log, lần sau thử lại.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class LiveSnapshotJob {

    private final LiveCollabService liveCollabService;

    @Scheduled(fixedDelayString = "${app.live.sweep-millis:5000}")
    public void sweep() {
        try {
            liveCollabService.sweep();
        } catch (RuntimeException e) {
            log.error("Job dọn và lưu phiên cộng tác gặp lỗi", e);
        }
    }

    @Scheduled(cron = "${app.live.purge-cron:0 45 3 * * *}")
    public void purge() {
        try {
            int purged = liveCollabService.purgeOldOps();
            if (purged > 0) {
                log.info("Cộng tác: đã xóa {} thao tác cũ", purged);
            }
        } catch (RuntimeException e) {
            log.error("Job xóa nhật ký thao tác cộng tác gặp lỗi", e);
        }
    }
}
