package com.ptit.music_be.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.AdminAiTaskResponse;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.service.AdminAiTaskService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/ai-tasks")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - AI Tasks", description = "Chỉ ROLE_ADMIN: giám sát hàng đợi tác vụ AI")
public class AdminAiTaskController {

    AdminAiTaskService adminAiTaskService;

    @GetMapping
    @Operation(
            summary = "AI tasks, newest first (status PENDING|PROCESSING|COMPLETED|FAILED|CANCELLED, type, keyword = score title/owner email, from/to yyyy-MM-dd)",
            description = "Cancel uses POST /api/ai-tasks/{id}/cancel, which already allows ADMIN",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<AdminAiTaskResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.<PageResponse<AdminAiTaskResponse>>builder()
                .result(adminAiTaskService.list(page, size, status, type, keyword, from, to))
                .build();
    }

    @GetMapping("/summary")
    @Operation(summary = "Queue summary: pending, processing, failed/completed in 24h, average run time by type (7 days)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminAiTaskResponse.Summary> summary() {
        return ApiResponse.<AdminAiTaskResponse.Summary>builder()
                .result(adminAiTaskService.summary())
                .build();
    }

    @GetMapping("/{taskId}")
    @Operation(summary = "Task detail with input/result data", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminAiTaskResponse> detail(@PathVariable String taskId) {
        return ApiResponse.<AdminAiTaskResponse>builder()
                .result(adminAiTaskService.detail(taskId))
                .build();
    }

    @PostMapping("/{taskId}/retry")
    @Operation(
            summary = "Retry a FAILED/CANCELLED OMR task (creates a new task for the same score, assigned to its owner)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminAiTaskResponse> retry(@PathVariable String taskId) {
        return ApiResponse.<AdminAiTaskResponse>builder()
                .result(adminAiTaskService.retry(taskId))
                .build();
    }
}
