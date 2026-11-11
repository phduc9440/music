package com.ptit.music_be.service.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import lombok.Getter;

/**
 * Cấu hình VNPay (môi trường thử). Khóa bí mật chỉ đọc từ biến môi trường {@code VNPAY_TMN_CODE},
 * {@code VNPAY_HASH_SECRET}; không ghi giá trị thật vào code hay file cấu hình đưa lên git.
 */
@Component
@Getter
public class VnPayProperties {

    private final String tmnCode;
    private final String hashSecret;
    private final String payUrl;
    /** Trang web mà VNPay đưa người dùng về sau khi trả (chỉ hiển thị kết quả, không kích hoạt gói). */
    private final String returnUrl;
    /** API tra cứu giao dịch (querydr) dùng để đối soát đơn quá hạn. */
    private final String queryUrl;

    public VnPayProperties(
            @Value("${vnpay.tmn-code:${VNPAY_TMN_CODE:}}") String tmnCode,
            @Value("${vnpay.hash-secret:${VNPAY_HASH_SECRET:}}") String hashSecret,
            @Value("${vnpay.pay-url:${VNPAY_PAY_URL:https://sandbox.vnpayment.vn/paymentv2/vpcpay.html}}") String payUrl,
            @Value("${vnpay.return-url:${VNPAY_RETURN_URL:http://localhost:5173/billing/result}}") String returnUrl,
            @Value("${vnpay.query-url:${VNPAY_QUERY_URL:https://sandbox.vnpayment.vn/merchant_webapi/api/transaction}}") String queryUrl) {
        this.tmnCode = tmnCode == null ? "" : tmnCode.trim();
        this.hashSecret = hashSecret == null ? "" : hashSecret.trim();
        this.payUrl = payUrl;
        this.returnUrl = returnUrl;
        this.queryUrl = queryUrl;
    }

    public boolean isConfigured() {
        return !tmnCode.isEmpty() && !hashSecret.isEmpty();
    }
}
