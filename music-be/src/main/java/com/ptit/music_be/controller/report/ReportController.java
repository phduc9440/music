package com.ptit.music_be.controller.report;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.report.ReportRequest;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.service.report.ContentReportService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Reports", description = "Báo cáo vi phạm bản nhạc, góp ý (R5)")
public class ReportController {

    ContentReportService reportService;

    @PostMapping("/scores/{scoreId}/reports")
    @Operation(
            summary =
                    "Report a score you can view (reason COPYRIGHT|SPAM|INAPPROPRIATE|OTHER, details up to 1000 chars and required for OTHER). Errors: 4002 invalid reason, 4003 own content, 4004 duplicate pending, 4005 rate limited",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> reportScore(@PathVariable String scoreId, @Valid @RequestBody ReportRequest request) {
        reportService.reportScore(scoreId, request);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/comments/{commentId}/reports")
    @Operation(
            summary = "Report a comment on a score you can view (same rules and errors as reporting a score)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> reportComment(@PathVariable String commentId, @Valid @RequestBody ReportRequest request) {
        reportService.reportComment(commentId, request);
        return ApiResponse.<Void>builder().build();
    }
}
