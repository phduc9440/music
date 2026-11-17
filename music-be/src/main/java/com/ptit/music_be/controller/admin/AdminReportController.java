package com.ptit.music_be.controller.admin;

import jakarta.validation.Valid;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.enums.report.ReportStatus;
import com.ptit.music_be.dto.enums.report.ReportTargetType;
import com.ptit.music_be.dto.request.report.ResolveReportRequest;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.report.ReportResponse;
import com.ptit.music_be.service.report.ContentReportService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/reports")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Reports", description = "Hàng chờ báo cáo vi phạm (quyền REPORTS_MODERATE)")
@PreAuthorize("@perm.has('REPORTS_MODERATE')")
public class AdminReportController {

    ContentReportService reportService;

    @GetMapping
    @Operation(
            summary = "Report queue (filters status PENDING|RESOLVED|DISMISSED, targetType SCORE|COMMENT|FORUM_POST); pending first-in first-out",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ReportResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) ReportStatus status,
            @RequestParam(required = false) ReportTargetType targetType) {
        return ApiResponse.<PageResponse<ReportResponse>>builder()
                .result(reportService.list(page, size, status, targetType))
                .build();
    }

    @GetMapping("/pending-count")
    @Operation(summary = "Number of pending reports", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Long> pendingCount() {
        return ApiResponse.<Long>builder().result(reportService.pendingCount()).build();
    }

    @PostMapping("/{reportId}/resolve")
    @Operation(
            summary =
                    "Resolve a report with action DISMISS|UNPUBLISH|HIDE|SOFT_DELETE|LOCK_ACCOUNT (UNPUBLISH and SOFT_DELETE for scores, HIDE for comments); every pending report on the same target closes together. Errors: 4007 handled, 4008 invalid action, 4009 target gone, 4010 note too long",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ReportResponse> resolve(
            @PathVariable String reportId, @Valid @RequestBody ResolveReportRequest request) {
        return ApiResponse.<ReportResponse>builder()
                .result(reportService.resolve(reportId, request))
                .build();
    }
}
