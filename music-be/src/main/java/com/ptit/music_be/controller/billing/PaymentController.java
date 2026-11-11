package com.ptit.music_be.controller.billing;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.dto.request.CreatePaymentOrderRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PaymentOrderResponse;
import com.ptit.music_be.service.payment.PaymentService;
import com.ptit.music_be.service.payment.PaymentService.IpnResult;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Payments", description = "Mua gói qua cổng thanh toán (VNPay sandbox)")
public class PaymentController {

    PaymentService paymentService;

    @PostMapping("/orders")
    @Operation(
            summary = "Tạo đơn mua gói, trả payUrl của cổng để chuyển hướng người dùng",
            description = "Errors: 3701 gói không tồn tại, 3711 cổng chưa cấu hình, 3712 gói không mua được, 3715 chu kỳ sai",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PaymentOrderResponse> createOrder(
            @RequestBody CreatePaymentOrderRequest request, HttpServletRequest http) {
        return ApiResponse.<PaymentOrderResponse>builder()
                .result(paymentService.createOrder(request, clientIp(http)))
                .build();
    }

    @GetMapping("/orders/{orderCode}")
    @Operation(
            summary = "Trạng thái đơn của tôi (trang kết quả chỉ hỏi và hiển thị, không kích hoạt gói)",
            description = "Errors: 3713 đơn không tồn tại hoặc không phải của bạn",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PaymentOrderResponse> getOrder(@PathVariable String orderCode) {
        return ApiResponse.<PaymentOrderResponse>builder()
                .result(paymentService.getMyOrder(orderCode))
                .build();
    }

    /**
     * IPN của VNPay (GET, không JWT, bắt buộc đúng chữ ký). Trả JSON {@code RspCode/Message} theo tài liệu VNPay:
     * 00 thành công, 97 sai chữ ký, 01 không thấy đơn, 04 sai số tiền, 02 đơn đã xử lý.
     */
    @GetMapping("/vnpay/ipn")
    @Operation(summary = "IPN của VNPay (cổng gọi, không cần đăng nhập, kiểm chữ ký)")
    public Map<String, String> vnpayIpn(@RequestParam Map<String, String> params) {
        IpnResult result = paymentService.handleIpn(PaymentProviderType.VNPAY, params);
        return switch (result) {
            case OK -> reply("00", "Confirm Success");
            case INVALID_SIGNATURE -> reply("97", "Invalid Checksum");
            case ORDER_NOT_FOUND -> reply("01", "Order not Found");
            case INVALID_AMOUNT -> reply("04", "Invalid Amount");
            case ALREADY_CONFIRMED -> reply("02", "Order already confirmed");
        };
    }

    private static Map<String, String> reply(String code, String message) {
        return Map.of("RspCode", code, "Message", message);
    }

    private static String clientIp(HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        return ip == null || ip.contains(":") ? "127.0.0.1" : ip;
    }
}
