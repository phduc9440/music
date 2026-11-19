package com.ptit.music_be.controller.admin;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.admin.AdminPracticeSessionResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.service.admin.AdminPracticeService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/practice")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Practice", description = "Quản lý luyện tập (quyền PRACTICE_VIEW / PRACTICE_MANAGE)")
@PreAuthorize("@perm.has('PRACTICE_VIEW')")
public class AdminPracticeController {

    AdminPracticeService practiceService;

    @GetMapping("/sessions")
    @Operation(
            summary =
                    "Practice sessions of everyone, newest first (keyword = member email/name or score title, mode FREE|LOOP|TEST|WAIT|FREE_RUN, status IN_PROGRESS|COMPLETED|ABANDONED, anomalousOnly, from/to yyyy-MM-dd)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<AdminPracticeSessionResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String mode,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "false") boolean anomalousOnly,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.<PageResponse<AdminPracticeSessionResponse>>builder()
                .result(practiceService.list(page, size, keyword, mode, status, anomalousOnly, from, to))
                .build();
    }

    @GetMapping("/overview")
    @Operation(
            summary = "System-wide practice statistics in a date range (default last 30 days, max 400)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminPracticeSessionResponse.Overview> overview(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.<AdminPracticeSessionResponse.Overview>builder()
                .result(practiceService.overview(from, to))
                .build();
    }

    @DeleteMapping("/sessions/{id}")
    @Operation(
            summary = "Delete a practice session for good (quyền PRACTICE_MANAGE)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id) {
        practiceService.delete(id);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/sessions/{id}/close")
    @Operation(
            summary = "Close a stuck IN_PROGRESS session as ABANDONED (quyền PRACTICE_MANAGE)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminPracticeSessionResponse> close(@PathVariable String id) {
        return ApiResponse.<AdminPracticeSessionResponse>builder()
                .result(practiceService.close(id))
                .build();
    }
}
