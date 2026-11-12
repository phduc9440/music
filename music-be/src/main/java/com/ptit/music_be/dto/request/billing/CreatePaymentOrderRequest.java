package com.ptit.music_be.dto.request.billing;

import com.ptit.music_be.dto.enums.billing.BillingPeriod;
import com.ptit.music_be.dto.enums.billing.PaymentProviderType;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class CreatePaymentOrderRequest {
    String planCode;
    BillingPeriod period;
    /** Mặc định VNPAY khi để trống. */
    PaymentProviderType provider;
}
