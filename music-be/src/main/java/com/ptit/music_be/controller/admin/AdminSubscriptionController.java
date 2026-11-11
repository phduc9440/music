package com.ptit.music_be.controller.admin;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.BulkGrantPlanRequest;
import com.ptit.music_be.dto.request.BulkSuspendRolePlanRequest;
import com.ptit.music_be.dto.request.GrantPlanRequest;
import com.ptit.music_be.dto.request.SuspendRolePlanRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.BulkGrantResult;
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
@Tag(name = "Admin - Subscriptions", description = "ADMIN xem gói của thành viên; chỉ SUPER_ADMIN cấp hoặc hủy gói")
public class AdminSubscriptionController {

    SubscriptionService subscriptionService;

    @PostMapping
    @Operation(
            summary = "Cấp gói cho thành viên N tháng (nguồn ADMIN_GRANT); cùng gói đang dùng thì cộng nối tiếp",
            description = "Chỉ SUPER_ADMIN, chỉ gói cá nhân. Errors: 1002 không phải SUPER_ADMIN, 3701 gói không tồn tại,"
                    + " 3703 số tháng sai, 3718 thành viên là SUPER_ADMIN, 3727 gói team, 1004 thành viên không tồn tại",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MySubscriptionResponse> grant(@RequestBody GrantPlanRequest request) {
        if (request.getMemberId() == null || request.getPlanCode() == null || request.getMonths() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        return ApiResponse.<MySubscriptionResponse>builder()
                .result(subscriptionService.grant(request.getMemberId(), request.getPlanCode(), request.getMonths()))
                .build();
    }

    @PostMapping("/bulk")
    @Operation(
            summary = "Cấp một gói cá nhân cho nhiều thành viên (tối đa 200), chỉ SUPER_ADMIN",
            description = "Cùng gói đang dùng thì gia hạn nối tiếp. Trả kết quả từng người: GRANTED / RENEWED / SKIPPED /"
                    + " FAILED. Errors: 1002 không phải SUPER_ADMIN, 1009 danh sách trống hoặc quá 200, 3701 gói không"
                    + " tồn tại, 3703 số tháng sai, 3727 gói team hoặc Free",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<BulkGrantResult>> grantMany(@RequestBody BulkGrantPlanRequest request) {
        if (request.getPlanCode() == null || request.getMonths() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        return ApiResponse.<List<BulkGrantResult>>builder()
                .result(subscriptionService.grantMany(request.getMemberIds(), request.getPlanCode(), request.getMonths()))
                .build();
    }

    @GetMapping("/{memberId}")
    @Operation(summary = "Gói hiện tại của thành viên", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MySubscriptionResponse> ofMember(@PathVariable String memberId) {
        return ApiResponse.<MySubscriptionResponse>builder()
                .result(subscriptionService.ofMember(memberId))
                .build();
    }

    @PostMapping("/{memberId}/role-plan-suspension")
    @Operation(
            summary = "Tạm ngưng gói Pro theo vai trò của một ADMIN (months: 0 = hết tháng này, 1..120 tháng), chỉ SUPER_ADMIN",
            description = "Errors: 1002 không phải SUPER_ADMIN, 1004 thành viên không tồn tại, 3728 không phải ADMIN,"
                    + " 3729 thời hạn hoặc lý do không hợp lệ",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MySubscriptionResponse> suspendRolePlan(
            @PathVariable String memberId, @RequestBody SuspendRolePlanRequest request) {
        if (request.getMonths() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        return ApiResponse.<MySubscriptionResponse>builder()
                .result(subscriptionService.suspendRolePlan(memberId, request.getMonths(), request.getReason()))
                .build();
    }

    @PostMapping("/role-plan-suspensions/bulk")
    @Operation(
            summary = "Tạm ngưng gói Pro theo vai trò của nhiều ADMIN (tối đa 200), chỉ SUPER_ADMIN",
            description = "Người không phải ADMIN thường được bỏ qua. Errors: 1002, 1009 danh sách trống hoặc quá 200,"
                    + " 3729 thời hạn hoặc lý do không hợp lệ",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<BulkGrantResult>> suspendMany(@RequestBody BulkSuspendRolePlanRequest request) {
        if (request.getMonths() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        return ApiResponse.<List<BulkGrantResult>>builder()
                .result(subscriptionService.suspendRolePlans(
                        request.getMemberIds(), request.getMonths(), request.getReason()))
                .build();
    }

    @PostMapping("/role-plan-suspensions/bulk-lift")
    @Operation(
            summary = "Mở lại sớm gói Pro theo vai trò của nhiều ADMIN (tối đa 200), chỉ SUPER_ADMIN",
            description = "Errors: 1002, 1009 danh sách trống hoặc quá 200",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<BulkGrantResult>> liftMany(@RequestBody BulkSuspendRolePlanRequest request) {
        return ApiResponse.<List<BulkGrantResult>>builder()
                .result(subscriptionService.liftRolePlanSuspensions(request.getMemberIds()))
                .build();
    }

    @DeleteMapping("/{memberId}/role-plan-suspension")
    @Operation(
            summary = "Mở lại sớm gói Pro theo vai trò của ADMIN, chỉ SUPER_ADMIN",
            description = "Errors: 1002 không phải SUPER_ADMIN, 1004 thành viên không tồn tại, 3728 không phải ADMIN",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MySubscriptionResponse> liftRolePlanSuspension(@PathVariable String memberId) {
        return ApiResponse.<MySubscriptionResponse>builder()
                .result(subscriptionService.liftRolePlanSuspension(memberId))
                .build();
    }

    @DeleteMapping("/{memberId}")
    @Operation(
            summary = "Hủy gói hiện tại của thành viên (về Free), chỉ SUPER_ADMIN",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> cancel(@PathVariable String memberId) {
        subscriptionService.cancel(memberId);
        return ApiResponse.<Void>builder().build();
    }
}
