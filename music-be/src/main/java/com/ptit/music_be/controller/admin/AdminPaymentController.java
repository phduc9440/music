package com.ptit.music_be.controller.admin;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.enums.billing.PaymentKind;
import com.ptit.music_be.dto.enums.billing.PaymentStatus;
import com.ptit.music_be.dto.response.admin.RevenueResponse;
import com.ptit.music_be.dto.response.billing.PaymentOrderResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.service.admin.AdminPaymentService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/payments")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Payments", description = "Chỉ ROLE_ADMIN: doanh thu, đơn thanh toán, hoàn tiền thủ công")
public class AdminPaymentController {

    AdminPaymentService adminPaymentService;

    @GetMapping("/revenue")
    @Operation(
            summary = "Doanh thu theo ngày và theo gói (đơn PAID), mặc định 30 ngày gần nhất",
            description = "Errors: 3716 khoảng ngày sai hoặc quá 366 ngày",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<RevenueResponse> revenue(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.<RevenueResponse>builder()
                .result(adminPaymentService.revenue(from, to))
                .build();
    }

    @GetMapping("/orders")
    @Operation(summary = "Danh sách đơn, mới nhất trước, lọc theo trạng thái và loại đơn (NEW/RENEW)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<PaymentOrderResponse>> orders(
            @RequestParam(required = false) PaymentStatus status,
            @RequestParam(required = false) PaymentKind kind,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.<PageResponse<PaymentOrderResponse>>builder()
                .result(adminPaymentService.orders(status, kind, page, size))
                .build();
    }

    @PostMapping("/orders/{id}/refund")
    @Operation(
            summary = "Hoàn tiền thủ công: đơn thành REFUNDED, trừ thời gian gói",
            description = "Errors: 3713 không tồn tại, 3714 đơn chưa ở trạng thái PAID",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PaymentOrderResponse> refund(@PathVariable String id) {
        return ApiResponse.<PaymentOrderResponse>builder()
                .result(adminPaymentService.refund(id))
                .build();
    }
}
