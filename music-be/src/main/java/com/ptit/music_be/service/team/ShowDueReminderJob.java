package com.ptit.music_be.service.team;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Mỗi sáng nhắc người phối (hoặc người duyệt nếu bài đang chờ duyệt) các bài sắp tới hạn trong show (mục 4.1). */
@Slf4j
@Component
@RequiredArgsConstructor
public class ShowDueReminderJob {

    private final ShowService showService;

    @Scheduled(cron = "${team.due-reminder-cron:0 0 8 * * *}")
    public void remind() {
        int n = showService.remindDue();
        if (n > 0) {
            log.info("Đã gửi {} thông báo nhắc hạn bài trong show", n);
        }
    }
}
