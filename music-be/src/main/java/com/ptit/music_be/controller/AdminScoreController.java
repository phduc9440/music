package com.ptit.music_be.controller;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.AdminScoreVisibilityRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.ScoreDetailResponse;
import com.ptit.music_be.dto.response.ScoreSummaryResponse;
import com.ptit.music_be.service.ScoreService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/scores")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Scores", description = "Chỉ ROLE_ADMIN: quản lý toàn bộ bản nhạc trong hệ thống")
public class AdminScoreController {

    ScoreService scoreService;

    @GetMapping
    @Operation(
            summary = "All scores of all users (search title/composer/owner email; visibility: PRIVATE|PENDING|PUBLIC)",
            description = "Delete uses DELETE /api/scores/{id}, which already allows ADMIN",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ScoreSummaryResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String visibility) {
        return ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                .result(scoreService.getAllForAdmin(page, size, keyword, visibility))
                .build();
    }

    @PutMapping("/{scoreId}/visibility")
    @Operation(
            summary = "Set a score PUBLIC or PRIVATE right away (PRIVATE: optional reason, leaves the curated library, owner is notified)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> setVisibility(
            @PathVariable String scoreId, @Valid @RequestBody AdminScoreVisibilityRequest request) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.setVisibilityByAdmin(scoreId, request.getVisibility(), request.getReason()))
                .build();
    }
}
