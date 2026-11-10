package com.ptit.music_be.controller;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.request.RejectPublishRequest;
import com.ptit.music_be.dto.request.ScoreTagsRequest;
import com.ptit.music_be.dto.request.ScoreUpdateRequest;
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
@RequestMapping("/api/scores")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Scores", description = "Library of the current member: list, detail, edit info, delete")
public class ScoreController {

    ScoreService scoreService;

    @GetMapping("/me")
    @Operation(
            summary = "List my scores (search, filter, paginate)",
            description =
                    "status: NONE|PENDING|PROCESSING|COMPLETED|FAILED; source: OMR|IMPORT|MANUAL; difficulty: EASY|MEDIUM|HARD|EXPERT; tagId: id from GET /api/tags; "
                            + "sort: newest (updated, default) | created | oldest | title; size: 1..50",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ScoreSummaryResponse>> getMyScores(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String tagId,
            @RequestParam(defaultValue = "newest") String sort) {
        return ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                .result(scoreService.getMyScores(page, size, keyword, status, source, difficulty, tagId, sort))
                .build();
    }

    @GetMapping("/shared-with-me")
    @Operation(
            summary = "Scores other people shared with me (invitation or approved request), with my access level",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ScoreSummaryResponse>> getSharedWithMe(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
        return ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                .result(scoreService.getSharedWithMe(page, size))
                .build();
    }

    @GetMapping("/pending-public")
    @Operation(
            summary = "ADMIN: scores whose owner asked to make them public and wait for approval",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ScoreSummaryResponse>> getPendingPublic(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
        return ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                .result(scoreService.getPendingPublic(page, size))
                .build();
    }

    @PostMapping("/{scoreId}/publish/approve")
    @Operation(
            summary = "ADMIN: approve making a score public (everyone signed in can then view and review it)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> approvePublic(@PathVariable String scoreId) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.approvePublic(scoreId))
                .build();
    }

    @PostMapping("/{scoreId}/publish/reject")
    @Operation(
            summary = "ADMIN: reject making a score public; it goes back to PRIVATE with an optional reason",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> rejectPublic(
            @PathVariable String scoreId, @Valid @RequestBody(required = false) RejectPublishRequest request) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.rejectPublic(scoreId, request == null ? null : request.getReason()))
                .build();
    }

    @GetMapping("/official")
    @Operation(
            summary = "Curated sheet library for beginners (easiest first); difficulty: EASY|MEDIUM|HARD|EXPERT",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ScoreSummaryResponse>> getOfficialScores(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String difficulty) {
        return ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                .result(scoreService.getOfficialScores(page, size, keyword, difficulty))
                .build();
    }

    @GetMapping("/official/candidates")
    @Operation(
            summary = "ADMIN: public scores that are not in the curated library yet",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ScoreSummaryResponse>> getOfficialCandidates(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                .result(scoreService.getOfficialCandidates(page, size, keyword))
                .build();
    }

    @PutMapping("/{scoreId}/official")
    @Operation(
            summary = "ADMIN: add a public score to the curated library (only ADMIN can then edit or delete it)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> markOfficial(@PathVariable String scoreId) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.markOfficial(scoreId))
                .build();
    }

    @DeleteMapping("/{scoreId}/official")
    @Operation(
            summary = "ADMIN: remove a score from the curated library (the score itself is kept)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> unmarkOfficial(@PathVariable String scoreId) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.unmarkOfficial(scoreId))
                .build();
    }

    @GetMapping("/{scoreId}")
    @Operation(
            summary = "Score detail (info + current files + latest task of each type)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> getScore(@PathVariable String scoreId) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.getScore(scoreId))
                .build();
    }

    @PatchMapping("/{scoreId}")
    @Operation(
            summary =
                    "Edit score info (title, composer, difficulty, studyNotes, visibility; PUBLIC from a non-admin owner becomes PENDING until an ADMIN approves); null fields are kept",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> updateScore(
            @PathVariable String scoreId, @Valid @RequestBody ScoreUpdateRequest request) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.updateScore(scoreId, request))
                .build();
    }

    @PutMapping("/{scoreId}/tags")
    @Operation(
            summary = "Replace the tags of a score (max 10, empty list removes all)",
            description = "Errors: 2301 tag not found, 2302 too many tags",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDetailResponse> updateTags(
            @PathVariable String scoreId, @Valid @RequestBody ScoreTagsRequest request) {
        return ApiResponse.<ScoreDetailResponse>builder()
                .result(scoreService.updateTags(scoreId, request.getTagIds()))
                .build();
    }

    @DeleteMapping("/{scoreId}")
    @Operation(
            summary = "Move a score to the trash for 30 days (owner, or ADMIN moderating a PUBLIC/PENDING score)",
            description = "Blocked while a task is running. ADMIN can pass a reason that is sent to the owner. "
                    + "See GET /api/scores/trash, POST /{id}/restore and DELETE /{id}/purge.",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> deleteScore(@PathVariable String scoreId, @RequestParam(required = false) String reason) {
        scoreService.deleteScore(scoreId, reason);
        return ApiResponse.<Void>builder().message("Score moved to trash").build();
    }
}
