package com.ptit.music_be.service.payment.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.billing.BillingPeriod;
import com.ptit.music_be.entity.PaymentOrder;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.service.payment.PaymentProvider.PaymentCallback;
import com.ptit.music_be.service.payment.PaymentProvider.PaymentContext;
import com.ptit.music_be.service.payment.VnPayProperties;

class VnPayProviderTest {

    private static final String SECRET = "TESTSECRETTESTSECRETTESTSECRET12";

    private final VnPayProvider provider =
            new VnPayProvider(new VnPayProperties("TMN001", SECRET, "https://pay.test/vpcpay", "http://web/return", "https://pay.test/query"), new ObjectMapper());

    /** Ký đúng như VNPay: các tham số vnp_* sắp theo tên, giá trị mã hóa URL, HMAC-SHA512. */
    private static String sign(Map<String, String> params) throws Exception {
        StringBuilder sb = new StringBuilder();
        new TreeMap<>(params).forEach((k, v) -> {
            if (sb.length() > 0) sb.append('&');
            sb.append(k).append('=').append(URLEncoder.encode(v, StandardCharsets.US_ASCII));
        });
        Mac mac = Mac.getInstance("HmacSHA512");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
        return HexFormat.of().formatHex(mac.doFinal(sb.toString().getBytes(StandardCharsets.UTF_8)));
    }

    private static Map<String, String> signed(String code, String status, long amountVnd) throws Exception {
        Map<String, String> p = new LinkedHashMap<>();
        p.put("vnp_TmnCode", "TMN001");
        p.put("vnp_TxnRef", "MU123");
        p.put("vnp_Amount", String.valueOf(amountVnd * 100));
        p.put("vnp_TransactionNo", "14000001");
        p.put("vnp_ResponseCode", code);
        p.put("vnp_TransactionStatus", status);
        p.put("vnp_OrderInfo", "Thanh toan goi PRO MONTH");
        p.put("vnp_SecureHash", sign(p));
        return p;
    }

    @Test
    void acceptsValidSuccessCallback() throws Exception {
        PaymentCallback cb = provider.parseCallback(signed("00", "00", 99000));

        assertTrue(cb.validSignature());
        assertTrue(cb.success());
        assertEquals("MU123", cb.orderCode());
        assertEquals(99000, cb.amount());
        assertEquals("14000001", cb.providerTxnId());
    }

    @Test
    void validSignatureButFailedPaymentIsNotSuccess() throws Exception {
        PaymentCallback cb = provider.parseCallback(signed("24", "02", 99000));

        assertTrue(cb.validSignature());
        assertFalse(cb.success());
    }

    @Test
    void rejectsTamperedAmount() throws Exception {
        Map<String, String> params = signed("00", "00", 99000);
        params.put("vnp_Amount", String.valueOf(1000L * 100));

        assertFalse(provider.parseCallback(params).validSignature());
    }

    @Test
    void rejectsMissingOrWrongHash() throws Exception {
        Map<String, String> noHash = signed("00", "00", 99000);
        noHash.remove("vnp_SecureHash");
        Map<String, String> wrong = signed("00", "00", 99000);
        wrong.put("vnp_SecureHash", "abc");

        assertFalse(provider.parseCallback(noHash).validSignature());
        assertFalse(provider.parseCallback(wrong).validSignature());
    }

    @Test
    void rejectsEverythingWhenNotConfigured() throws Exception {
        VnPayProvider unconfigured =
                new VnPayProvider(new VnPayProperties("", "", "https://pay.test/vpcpay", "http://web/return", "https://pay.test/query"), new ObjectMapper());

        assertFalse(unconfigured.isConfigured());
        assertFalse(unconfigured.parseCallback(signed("00", "00", 99000)).validSignature());
    }

    @Test
    void createdPaymentUrlCarriesVerifiableSignatureAndScaledAmount() throws Exception {
        PaymentOrder order = PaymentOrder.builder()
                .orderCode("MUABC")
                .plan(Plan.builder().code("PRO").build())
                .period(BillingPeriod.MONTH)
                .amount(99000)
                .expiresAt(LocalDateTime.now().plusMinutes(15))
                .build();

        String url = provider.createPayment(order, new PaymentContext("203.0.113.5", "vn")).payUrl();

        assertTrue(url.startsWith("https://pay.test/vpcpay?"));
        Map<String, String> query = new LinkedHashMap<>();
        for (String pair : url.substring(url.indexOf('?') + 1).split("&")) {
            String[] kv = pair.split("=", 2);
            query.put(kv[0], java.net.URLDecoder.decode(kv[1], StandardCharsets.US_ASCII));
        }
        assertEquals("9900000", query.get("vnp_Amount"));
        assertEquals("MUABC", query.get("vnp_TxnRef"));
        assertEquals("203.0.113.5", query.get("vnp_IpAddr"));
        // Chữ ký trong link đúng với bộ tham số còn lại (VNPay sẽ kiểm bằng cách này)
        Map<String, String> withoutHash = new LinkedHashMap<>(query);
        String hash = withoutHash.remove("vnp_SecureHash");
        assertEquals(sign(withoutHash), hash);
    }

    @Test
    void queryResponseWithValidSignatureIsParsedAndForgedOneIsIgnored() throws Exception {
        ObjectMapper om = new ObjectMapper();
        String[] f = {"vnp_ResponseId", "vnp_Command", "vnp_ResponseCode", "vnp_Message", "vnp_TmnCode", "vnp_TxnRef",
            "vnp_Amount", "vnp_BankCode", "vnp_PayDate", "vnp_TransactionNo", "vnp_TransactionType",
            "vnp_TransactionStatus", "vnp_OrderInfo", "vnp_PromotionCode", "vnp_PromotionAmount"};
        Map<String, String> r = new LinkedHashMap<>();
        for (String k : f) r.put(k, "");
        r.put("vnp_ResponseCode", "00");
        r.put("vnp_TmnCode", "TMN001");
        r.put("vnp_TxnRef", "MU123");
        r.put("vnp_Amount", "9900000");
        r.put("vnp_TransactionNo", "14000001");
        r.put("vnp_TransactionStatus", "00");
        Mac mac = Mac.getInstance("HmacSHA512");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
        String data = String.join("|", r.values());
        r.put("vnp_SecureHash", HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8))));

        PaymentCallback ok = provider.parseQueryResponse(om.valueToTree(r), "MU123").orElseThrow();
        assertTrue(ok.success());
        assertEquals(99000, ok.amount());

        r.put("vnp_Amount", "100");
        assertTrue(provider.parseQueryResponse(om.valueToTree(r), "MU123").isEmpty());
    }
}
