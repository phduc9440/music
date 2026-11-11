package com.ptit.music_be.service.payment;

import java.util.Map;

import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.entity.PaymentOrder;

/** Một cổng thanh toán: tạo giao dịch và xác thực thông báo kết quả (IPN) từ cổng. */
public interface PaymentProvider {

    PaymentProviderType type();

    /** Đã có đủ khóa cấu hình (biến môi trường) để dùng chưa. */
    boolean isConfigured();

    /** Tạo giao dịch cho đơn, trả địa chỉ chuyển hướng người dùng sang trang thanh toán của cổng. */
    PaymentInit createPayment(PaymentOrder order, PaymentContext context);

    /** Đọc thông báo từ cổng và kiểm chữ ký. Chữ ký sai thì {@code validSignature = false}, các trường khác vô nghĩa. */
    PaymentCallback parseCallback(Map<String, String> params);

    /** Ngữ cảnh người mua: địa chỉ IP và ngôn ngữ ("vn" hoặc "en"). */
    record PaymentContext(String clientIp, String locale) {}

    record PaymentInit(String payUrl) {}

    /** Kết quả đã xác thực của một thông báo: mã đơn, số tiền VND, mã giao dịch phía cổng, thành công hay không. */
    record PaymentCallback(
            boolean validSignature, String orderCode, long amount, String providerTxnId, boolean success) {}
}
