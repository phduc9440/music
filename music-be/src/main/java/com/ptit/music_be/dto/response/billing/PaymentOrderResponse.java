package com.ptit.music_be.dto.response.billing;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PaymentOrderResponse {
    String id;
    String orderCode;
    String planCode;
    String planName;
    String period;
    /** NEW (mua mới / đổi gói) hoặc RENEW (gia hạn). */
    String kind;
    long amount;
    String provider;
    String status;
    LocalDateTime createdAt;
    LocalDateTime expiresAt;
    LocalDateTime paidAt;
    /** Chỉ có ở admin. */
    String memberEmail;
    /** Chỉ có khi vừa tạo đơn: địa chỉ trang thanh toán của cổng. */
    String payUrl;
}
