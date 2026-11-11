package com.ptit.music_be.controller.admin;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.BulkGrantPlanRequest;
import com.ptit.music_be.dto.request.GrantPlanRequest;
import com.ptit.music_be.dto.request.PlanSanctionRequest;
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

    @PostMapping("/sanctions/revoke")
    @Operation(
            summary = "Thu hồi gói đang dùng của một hoặc nhiều thành viên do vi phạm (tối đa 200), chỉ SUPER_ADMIN",
            description = "Gói bị hủy ngay, muốn dùng lại phải mua lại. Kết quả từng người: REVOKED / SKIPPED / FAILED."
                    + " Errors: 1002, 1009 danh sách trống hoặc quá 200, 3728 lý do quá dài",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<BulkGrantResult>> revoke(@RequestBody PlanSanctionRequest request) {
        return ApiResponse.<List<BulkGrantResult>>builder()
                .result(subscriptionService.revokePlans(request.getMemberIds(), request.getReason()))
                .build();
    }

    @PostMapping("/sanctions/ban")
    @Operation(
            summary = "Cấm dùng một gói N tháng (1..120) cho một hoặc nhiều thành viên, chỉ SUPER_ADMIN",
            description = "planCode = gói bị cấm (bỏ trống = gói đang dùng của từng người). Không dùng, mua hay được cấp lại"
                    + " gói đó; vẫn dùng Free hoặc mua gói khác. Kết quả từng người: BANNED /"
                    + " SKIPPED / FAILED. Errors: 1002, 1009, 3728 thời hạn hoặc lý do không hợp lệ",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<BulkGrantResult>> ban(@RequestBody PlanSanctionRequest request) {
        if (request.getMonths() == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        return ApiResponse.<List<BulkGrantResult>>builder()
                .result(subscriptionService.banPlans(
                        request.getMemberIds(), request.getMonths(), request.getReason(), request.getPlanCode()))
                .build();
    }

    @PostMapping("/sanctions/lift")
    @Operation(
            summary = "Gỡ cấm sớm cho một hoặc nhiều thành viên, chỉ SUPER_ADMIN",
            description = "Kết quả từng người: LIFTED / SKIPPED (không bị cấm) / FAILED. Errors: 1002, 1009",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<BulkGrantResult>> lift(@RequestBody PlanSanctionRequest request) {
        return ApiResponse.<List<BulkGrantResult>>builder()
                .result(subscriptionService.liftBans(request.getMemberIds()))
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
