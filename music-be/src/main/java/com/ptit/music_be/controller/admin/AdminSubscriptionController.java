package com.ptit.music_be.controller.admin;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.GrantPlanRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.MySubscriptionResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.billing.SubscriptionService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/subscriptions")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Subscriptions", description = "Chỉ ROLE_ADMIN: cấp hoặc hủy gói thủ công")
public class AdminSubscriptionController {

    SubscriptionService subscriptionService;

    @PostMapping
    @Operation(
            summary = "Cấp gói cho thành viên trong N ngày (nguồn ADMIN_GRANT)",
            description = "Errors: 3701 gói không tồn tại, 3703 số ngày sai, 1004 thành viên không tồn tại",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MySubscriptionResponse> grant(@RequestBody GrantPlanRequest request) {
        if (request.getMemberId() == null || request.getPlanCode() == null || request.getDays() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        return ApiResponse.<MySubscriptionResponse>builder()
                .result(subscriptionService.grant(request.getMemberId(), request.getPlanCode(), request.getDays()))
                .build();
    }

    @DeleteMapping("/{memberId}")
    @Operation(summary = "Hủy gói hiện tại của thành viên (về Free)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> cancel(@PathVariable String memberId) {
        subscriptionService.cancel(memberId);
        return ApiResponse.<Void>builder().build();
    }
}
