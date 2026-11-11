package com.ptit.music_be.controller.admin;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.UpdatePlanPriceRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PlanResponse;
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
@Tag(name = "Admin Plans", description = "Giá các gói dịch vụ: ADMIN xem, SUPER_ADMIN sửa")
public class AdminPlanController {

    AdminPlanService adminPlanService;

    @GetMapping
    @Operation(summary = "Danh sách gói kèm giá", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<PlanResponse>> list() {
        return ApiResponse.<List<PlanResponse>>builder()
                .result(adminPlanService.list())
                .build();
    }

    @PutMapping("/{code}/price")
    @Operation(
            summary = "Đổi giá tháng/năm của gói (chỉ SUPER_ADMIN)",
            description = "Errors: 1002 không phải SUPER_ADMIN, 3701 gói không tồn tại, 3719 giá không hợp lệ",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PlanResponse> updatePrice(
            @PathVariable String code, @RequestBody UpdatePlanPriceRequest request) {
        return ApiResponse.<PlanResponse>builder()
                .result(adminPlanService.updatePrice(code, request))
                .build();
    }
}
