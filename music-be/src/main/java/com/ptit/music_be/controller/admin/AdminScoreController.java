package com.ptit.music_be.controller.admin;

import jakarta.validation.Valid;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.admin.AdminScoreBulkRequest;
import com.ptit.music_be.dto.request.admin.AdminScoreVisibilityRequest;
import com.ptit.music_be.dto.response.admin.AdminScoreBulkResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.score.ScoreDetailResponse;
import com.ptit.music_be.dto.response.score.ScoreSummaryResponse;
import com.ptit.music_be.service.admin.AdminScoreBulkService;
import com.ptit.music_be.service.score.ScoreService;

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
@PreAuthorize("@perm.has('SCORES_MODERATE')")
public class AdminScoreController {

    ScoreService scoreService;
    AdminScoreBulkService adminScoreBulkService;

    @GetMapping
    @Operation(
            summary =
                    "All scores of all users (search title/composer/owner email; filters visibility PRIVATE|PENDING|PUBLIC, official true|false, source OMR|IMPORT|MANUAL, difficulty; sort UPDATED|CREATED|TITLE|VIEWS)",
            description = "Delete uses DELETE /api/scores/{id}, which already allows ADMIN",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ScoreSummaryResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String visibility,
            @RequestParam(required = false) String official,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String sort) {
        return ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                .result(scoreService.getAllForAdmin(
                        page, size, keyword, visibility, official, source, difficulty, sort))
                .build();
    }

    @PutMapping("/{scoreId}/visibility")
    @Operation(
            summary =
                    "Moderate: approve a PENDING score to PUBLIC, or take a PUBLIC score down to PRIVATE (optional reason, leaves the curated library, owner is notified). Other transitions are rejected",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> setVisibility(
            @PathVariable String scoreId, @Valid @RequestBody AdminScoreVisibilityRequest request) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.setVisibilityByAdmin(scoreId, request.getVisibility(), request.getReason()))
                .build();
    }

    @PostMapping("/bulk")
    @Operation(
            summary =
                    "Apply PUBLIC (approve pending scores only) / PRIVATE (take down public scores, reason) / DELETE to up to 100 scores; each one is processed on its own, failures are listed",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminScoreBulkResponse> bulk(@Valid @RequestBody AdminScoreBulkRequest request) {
        return ApiResponse.<AdminScoreBulkResponse>builder()
                .result(adminScoreBulkService.apply(request))
                .build();
    }
}
