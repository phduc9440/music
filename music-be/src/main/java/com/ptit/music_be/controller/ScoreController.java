package com.ptit.music_be.controller;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
            description = "status: NONE|PENDING|PROCESSING|COMPLETED|FAILED; source: OMR|IMPORT|MANUAL; difficulty: EASY|MEDIUM|HARD|EXPERT; "
                    + "sort: newest (default) | oldest | title; size: 1..50",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ScoreSummaryResponse>> getMyScores(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String difficulty,
            @RequestParam(defaultValue = "newest") String sort) {
        return ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                .result(scoreService.getMyScores(page, size, keyword, status, source, difficulty, sort))
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
            summary = "Edit score info (title, composer, difficulty, studyNotes, visibility); null fields are kept",
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
            summary = "Delete a score and its files (owner or ADMIN only; blocked while a task is PROCESSING)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> deleteScore(@PathVariable String scoreId) {
        scoreService.deleteScore(scoreId);
        return ApiResponse.<Void>builder().message("Score deleted").build();
    }
}
