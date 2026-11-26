package com.ptit.music_be.controller.admin;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.admin.AdminDashboardResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.service.admin.AdminDashboardService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/dashboard")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Dashboard", description = "Chỉ ROLE_ADMIN: thống kê tổng quan hệ thống")
public class AdminDashboardController {

    AdminDashboardService adminDashboardService;

    @GetMapping
    @Operation(
            summary = "Totals, daily new scores/practice and breakdowns (days 7-90, default 30)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminDashboardResponse> get(@RequestParam(defaultValue = "30") int days) {
        return ApiResponse.<AdminDashboardResponse>builder()
                .result(adminDashboardService.getDashboard(days))
                .build();
    }
}
