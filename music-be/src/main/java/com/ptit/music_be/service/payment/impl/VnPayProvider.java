package com.ptit.music_be.service.payment.impl;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.entity.PaymentOrder;
import com.ptit.music_be.service.payment.PaymentProvider;
import com.ptit.music_be.service.payment.VnPayProperties;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * VNPay (phiên bản 2.1.0). Chữ ký là HMAC-SHA512 của các tham số {@code vnp_*} sắp theo tên, nối dạng
 * {@code khóa=giá trị} (giá trị mã hóa URL) bằng dấu {@code &}. Số tiền gửi cho VNPay nhân 100.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class VnPayProvider implements PaymentProvider {

    static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final String SUCCESS_CODE = "00";

    private final VnPayProperties props;
    private final ObjectMapper objectMapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

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

    @Override
    public Optional<PaymentCallback> queryTransaction(PaymentOrder order) {
        if (!props.isConfigured()) {
            return Optional.empty();
        }
        ZonedDateTime created = order.getCreatedAt() == null
                ? ZonedDateTime.now(VN_ZONE)
                : order.getCreatedAt().atZone(ZoneId.systemDefault()).withZoneSameInstant(VN_ZONE);
        String requestId = UUID.randomUUID().toString().replace("-", "");
        String createDate = STAMP.format(ZonedDateTime.now(VN_ZONE));
        String txnDate = STAMP.format(created);
        String orderInfo = "Kiem tra ket qua giao dich " + order.getOrderCode();
        String ip = "127.0.0.1";
        // Thứ tự trường ký theo tài liệu VNPay querydr
        String data = String.join(
                "|", requestId, "2.1.0", "querydr", props.getTmnCode(), order.getOrderCode(), txnDate, createDate, ip,
                orderInfo);
        Map<String, String> body = new TreeMap<>();
        body.put("vnp_RequestId", requestId);
        body.put("vnp_Version", "2.1.0");
        body.put("vnp_Command", "querydr");
        body.put("vnp_TmnCode", props.getTmnCode());
        body.put("vnp_TxnRef", order.getOrderCode());
        body.put("vnp_OrderInfo", orderInfo);
        body.put("vnp_TransactionDate", txnDate);
        body.put("vnp_CreateDate", createDate);
        body.put("vnp_IpAddr", ip);
        body.put("vnp_SecureHash", sign(data));
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(props.getQueryUrl()))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("VNPay querydr đơn {} trả HTTP {}", order.getOrderCode(), response.statusCode());
                return Optional.empty();
            }
            return parseQueryResponse(objectMapper.readTree(response.body()), order.getOrderCode());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (Exception e) {
            log.warn("VNPay querydr đơn {} lỗi: {}", order.getOrderCode(), e.getMessage());
            return Optional.empty();
        }
    }

    /** Đọc phản hồi querydr và kiểm chữ ký; chữ ký sai hoặc cổng không có giao dịch thì trả rỗng. */
    Optional<PaymentCallback> parseQueryResponse(JsonNode json, String orderCode) {
        String[] fields = {
            "vnp_ResponseId", "vnp_Command", "vnp_ResponseCode", "vnp_Message", "vnp_TmnCode", "vnp_TxnRef",
            "vnp_Amount", "vnp_BankCode", "vnp_PayDate", "vnp_TransactionNo", "vnp_TransactionType",
            "vnp_TransactionStatus", "vnp_OrderInfo", "vnp_PromotionCode", "vnp_PromotionAmount"
        };
        StringBuilder data = new StringBuilder();
        for (int i = 0; i < fields.length; i++) {
            if (i > 0) {
                data.append('|');
            }
            data.append(json.path(fields[i]).asText(""));
        }
        String received = json.path("vnp_SecureHash").asText("");
        boolean valid = props.isConfigured()
                && MessageDigest.isEqual(
                        sign(data.toString()).getBytes(StandardCharsets.US_ASCII),
                        received.toLowerCase().getBytes(StandardCharsets.US_ASCII));
        if (!valid) {
            log.warn("VNPay querydr đơn {} sai chữ ký phản hồi, bỏ qua", orderCode);
            return Optional.empty();
        }
        if (!SUCCESS_CODE.equals(json.path("vnp_ResponseCode").asText())) {
            // 91 = không tìm thấy giao dịch: khách chưa từng trả
            return Optional.empty();
        }
        long amount;
        try {
            amount = Long.parseLong(json.path("vnp_Amount").asText("0")) / 100;
        } catch (NumberFormatException e) {
            amount = -1;
        }
        boolean success = SUCCESS_CODE.equals(json.path("vnp_TransactionStatus").asText());
        return Optional.of(new PaymentCallback(
                true, json.path("vnp_TxnRef").asText(null), amount, json.path("vnp_TransactionNo").asText(null), success));
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
