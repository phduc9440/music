package com.ptit.music_be.service.notification;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import com.ptit.music_be.utils.AppTime;

/** Mỗi sáng gửi email tóm tắt thông báo chưa đọc cho người đã bật email (mục R8). */
@Component
@RequiredArgsConstructor
public class NotificationDigestJob {

    private final NotificationDigestService digestService;

    @Scheduled(cron = "${notification.digest-cron:0 0 7 * * *}", zone = AppTime.ZONE_ID)
    public void run() {
        digestService.sendDaily();
    }
}
