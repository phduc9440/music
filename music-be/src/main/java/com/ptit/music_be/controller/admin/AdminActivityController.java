package com.ptit.music_be.controller.admin;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.admin.AdminActivityResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.service.admin.AdminActivityService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/activity")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Activity", description = "Nhật ký quản trị suy ra từ các bảng gốc (quyền AUDIT_VIEW)")
@PreAuthorize("@perm.has('AUDIT_VIEW')")
public class AdminActivityController {

    AdminActivityService activityService;

    @GetMapping
    @Operation(
            summary =
                    "Admin activity, newest first, derived from reports, trashed scores, hidden comments, teams removed by admin and plan sanctions (filters: actor email contains, type, targetType SCORE|COMMENT|TEAM|MEMBER, from/to as yyyy-MM-dd inclusive)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<AdminActivityResponse>> search(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size,
            @RequestParam(required = false) String actor,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String targetType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.<PageResponse<AdminActivityResponse>>builder()
                .result(activityService.search(
                        page,
                        size,
                        actor,
                        type,
                        targetType,
                        from == null ? null : from.atStartOfDay(),
                        to == null ? null : to.plusDays(1).atStartOfDay()))
                .build();
    }

    @GetMapping("/types")
    @Operation(summary = "Activity types, for the filter", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<String>> types() {
        return ApiResponse.<List<String>>builder().result(activityService.types()).build();
    }
}
