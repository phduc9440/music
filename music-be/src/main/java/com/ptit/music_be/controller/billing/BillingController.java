package com.ptit.music_be.controller.billing;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.MySubscriptionResponse;
import com.ptit.music_be.dto.response.PlanResponse;
import com.ptit.music_be.service.billing.SubscriptionService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Billing", description = "Gói dịch vụ và hạn mức")
public class BillingController {

    SubscriptionService subscriptionService;

    @GetMapping("/api/public/plans")
    @Operation(summary = "Danh sách gói (bảng giá), không cần đăng nhập")
    public ApiResponse<List<PlanResponse>> plans() {
        return ApiResponse.<List<PlanResponse>>builder()
                .result(subscriptionService.listPlans())
                .build();
    }

    @GetMapping("/api/subscriptions/me")
    @Operation(
            summary = "Gói hiện tại và số đã dùng trong tháng",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MySubscriptionResponse> mine() {
        return ApiResponse.<MySubscriptionResponse>builder()
                .result(subscriptionService.mine())
                .build();
    }
}
