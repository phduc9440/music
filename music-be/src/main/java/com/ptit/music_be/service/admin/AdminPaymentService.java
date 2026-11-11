package com.ptit.music_be.service.admin;

import java.time.LocalDate;

import com.ptit.music_be.dto.enums.PaymentStatus;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.PaymentOrderResponse;
import com.ptit.music_be.dto.response.RevenueResponse;

public interface AdminPaymentService {

    /** Doanh thu từ ngày {@code from} đến hết ngày {@code to} (null = 30 ngày gần nhất), tối đa 366 ngày. */
    RevenueResponse revenue(LocalDate from, LocalDate to);

    PageResponse<PaymentOrderResponse> orders(PaymentStatus status, int page, int size);

    /** Hoàn tiền thủ công: đánh dấu REFUNDED và trừ thời gian của gói đã cộng. Tiền trả lại làm ở cổng. */
    PaymentOrderResponse refund(String orderId);
}
