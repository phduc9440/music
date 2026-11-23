package com.ptit.music_be.service.payment;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Mỗi giờ chuyển các đơn PENDING quá hạn sang EXPIRED. Chưa hỏi lại cổng về các đơn này: nếu cổng báo muộn rằng đơn đã
 * thanh toán thì IPN vẫn được nhận và bật gói (xem PaymentServiceImpl.handleIpn).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BillingJobs {

    private final PaymentService paymentService;

    @Scheduled(cron = "${billing.order-expiry-cron:0 5 * * * *}")
    public void expireOrders() {
        int n = paymentService.expirePending();
        if (n > 0) {
            log.info("Đã chuyển {} đơn thanh toán quá hạn sang EXPIRED", n);
        }
    }
}
