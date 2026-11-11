package com.ptit.music_be.service.payment.impl;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.entity.PaymentOrder;
import com.ptit.music_be.service.payment.PaymentProvider;
import com.ptit.music_be.service.payment.VnPayProperties;

import lombok.RequiredArgsConstructor;

/**
 * VNPay (phiên bản 2.1.0). Chữ ký là HMAC-SHA512 của các tham số {@code vnp_*} sắp theo tên, nối dạng
 * {@code khóa=giá trị} (giá trị mã hóa URL) bằng dấu {@code &}. Số tiền gửi cho VNPay nhân 100.
 */
@Component
@RequiredArgsConstructor
public class VnPayProvider implements PaymentProvider {

    static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final String SUCCESS_CODE = "00";

    private final VnPayProperties props;

    @Override
    public PaymentProviderType type() {
        return PaymentProviderType.VNPAY;
    }

    @Override
    public boolean isConfigured() {
        return props.isConfigured();
    }

    @Override
    public PaymentInit createPayment(PaymentOrder order, PaymentContext context) {
        ZonedDateTime now = ZonedDateTime.now(VN_ZONE);
        // Hết hạn tính theo thời gian còn lại của đơn để không phụ thuộc múi giờ máy chủ
        ZonedDateTime expire =
                now.plus(Duration.between(LocalDateTime.now(), order.getExpiresAt()).abs());

        Map<String, String> p = new TreeMap<>();
        p.put("vnp_Version", "2.1.0");
        p.put("vnp_Command", "pay");
        p.put("vnp_TmnCode", props.getTmnCode());
        p.put("vnp_Amount", String.valueOf(order.getAmount() * 100));
        p.put("vnp_CurrCode", "VND");
        p.put("vnp_TxnRef", order.getOrderCode());
        p.put(
                "vnp_OrderInfo",
                "Thanh toan goi " + order.getPlan().getCode() + " " + order.getPeriod().name());
        p.put("vnp_OrderType", "other");
        p.put("vnp_Locale", "en".equals(context.locale()) ? "en" : "vn");
        p.put("vnp_ReturnUrl", props.getReturnUrl());
        p.put("vnp_IpAddr", context.clientIp());
        p.put("vnp_CreateDate", STAMP.format(now));
        p.put("vnp_ExpireDate", STAMP.format(expire));

        String query = canonical(p);
        return new PaymentInit(props.getPayUrl() + "?" + query + "&vnp_SecureHash=" + sign(query));
    }

    @Override
    public PaymentCallback parseCallback(Map<String, String> params) {
        String received = params.get("vnp_SecureHash");
        Map<String, String> signed = new TreeMap<>();
        params.forEach((k, v) -> {
            if (k.startsWith("vnp_") && !k.equals("vnp_SecureHash") && !k.equals("vnp_SecureHashType") && v != null) {
                signed.put(k, v);
            }
        });
        boolean valid = received != null
                && props.isConfigured()
                && MessageDigest.isEqual(
                        sign(canonical(signed)).getBytes(StandardCharsets.US_ASCII),
                        received.toLowerCase().getBytes(StandardCharsets.US_ASCII));
        if (!valid) {
            return new PaymentCallback(false, null, 0, null, false);
        }
        long amount;
        try {
            amount = Long.parseLong(signed.getOrDefault("vnp_Amount", "0")) / 100;
        } catch (NumberFormatException e) {
            amount = -1;
        }
        boolean success = SUCCESS_CODE.equals(signed.get("vnp_ResponseCode"))
                && SUCCESS_CODE.equals(signed.get("vnp_TransactionStatus"));
        return new PaymentCallback(true, signed.get("vnp_TxnRef"), amount, signed.get("vnp_TransactionNo"), success);
    }

    private static String canonical(Map<String, String> sorted) {
        StringBuilder sb = new StringBuilder();
        sorted.forEach((k, v) -> {
            if (v == null || v.isEmpty()) {
                return;
            }
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(k).append('=').append(URLEncoder.encode(v, StandardCharsets.US_ASCII));
        });
        return sb.toString();
    }

    private String sign(String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(props.getHashSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("Không ký được yêu cầu VNPay", e);
        }
    }
}
