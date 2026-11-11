package com.ptit.music_be.service.billing;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Mỗi ngày chuyển các gói quá hạn sang EXPIRED (thành viên tự về gói Free vì không còn dòng ACTIVE còn hạn). */
@Slf4j
@Component
@RequiredArgsConstructor
public class SubscriptionExpiryJob {

    private final SubscriptionService subscriptionService;

    @Scheduled(cron = "${billing.expiry-cron:0 10 0 * * *}")
    public void run() {
        int n = subscriptionService.expireDue();
        if (n > 0) {
            log.info("Đã chuyển {} gói quá hạn sang EXPIRED", n);
        }
    }

    /** Mỗi ngày lúc 9 giờ nhắc các gói còn 7 ngày và còn 1 ngày là hết hạn. */
    @Scheduled(cron = "${billing.reminder-cron:0 0 9 * * *}")
    public void remind() {
        int n = subscriptionService.remindExpiring();
        if (n > 0) {
            log.info("Đã gửi {} thông báo gói sắp hết hạn", n);
        }
    }
}
