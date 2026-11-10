package com.ptit.music_be.controller.admin;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ErrorLogResponse;
import com.ptit.music_be.dto.response.SystemMetricsResponse;
import com.ptit.music_be.service.admin.AdminSystemService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/system")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - System", description = "Chỉ ROLE_ADMIN: nhật ký lỗi và thông số tải máy chủ")
public class AdminSystemController {

    AdminSystemService adminSystemService;

    @GetMapping("/metrics")
    @Operation(
            summary = "Server load: heap, CPU, memory, threads, disk, uptime",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<SystemMetricsResponse> metrics() {
        return ApiResponse.<SystemMetricsResponse>builder()
                .result(adminSystemService.getMetrics())
                .build();
    }

    @GetMapping("/error-logs")
    @Operation(
            summary = "Recent ERROR logs kept in memory (newest first, limit 1-200, default 50)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<ErrorLogResponse>> errorLogs(@RequestParam(required = false) Integer limit) {
        return ApiResponse.<List<ErrorLogResponse>>builder()
                .result(adminSystemService.getErrorLogs(limit))
                .build();
    }

    @DeleteMapping("/error-logs")
    @Operation(summary = "Clear the in-memory error logs", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> clearErrorLogs() {
        adminSystemService.clearErrorLogs();
        return ApiResponse.<Void>builder().build();
    }
}
