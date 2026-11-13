package com.ptit.music_be.controller.admin;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.admin.CreatePlanRequest;
import com.ptit.music_be.dto.request.admin.UpdatePlanRequest;
import com.ptit.music_be.dto.response.billing.PlanResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.service.admin.AdminPlanService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/plans")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin Plans", description = "Gói dịch vụ: ADMIN xem, SUPER_ADMIN thêm/sửa/xóa")
public class AdminPlanController {

    AdminPlanService adminPlanService;

    @PreAuthorize("@perm.any('PLANS_MANAGE,SUBSCRIPTIONS_MANAGE,REVENUE_VIEW')")
    @GetMapping
    @Operation(summary = "Danh sách gói kèm giá", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<PlanResponse>> list() {
        return ApiResponse.<List<PlanResponse>>builder()
                .result(adminPlanService.list())
                .build();
    }

    @PostMapping
    @Operation(
            summary = "Tạo gói mới (chỉ SUPER_ADMIN)",
            description =
                    "Errors: 1002 không phải SUPER_ADMIN, 3719 giá, 3720 tên, 3721 hạn mức, 3722 mã gói không hợp lệ,"
                            + " 3723 mã đã tồn tại, 3724 nhóm gói không hợp lệ",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PlanResponse> create(@RequestBody CreatePlanRequest request) {
        return ApiResponse.<PlanResponse>builder()
                .result(adminPlanService.create(request))
                .build();
    }

    @DeleteMapping("/{code}")
    @Operation(
            summary = "Xóa gói (chỉ SUPER_ADMIN)",
            description =
                    "Errors: 1002 không phải SUPER_ADMIN, 3701 gói không tồn tại, 3725 gói Free/Pro không xóa được,"
                            + " 3726 gói đã có người đăng ký hoặc có đơn",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String code) {
        adminPlanService.delete(code);
        return ApiResponse.<Void>builder().build();
    }

    @PutMapping("/{code}")
    @Operation(
            summary = "Sửa tên, giá và hạn mức của gói (chỉ SUPER_ADMIN)",
            description = "Errors: 1002 không phải SUPER_ADMIN, 3701 gói không tồn tại, 3719 giá không hợp lệ,"
                    + " 3720 tên không hợp lệ, 3721 hạn mức hoặc thứ tự không hợp lệ",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PlanResponse> update(@PathVariable String code, @RequestBody UpdatePlanRequest request) {
        return ApiResponse.<PlanResponse>builder()
                .result(adminPlanService.update(code, request))
                .build();
    }
}
