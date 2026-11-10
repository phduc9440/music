package com.ptit.music_be.controller.score;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.ReviewRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ReviewListResponse;
import com.ptit.music_be.service.score.ScoreReviewService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/scores/{scoreId}/reviews")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Score reviews", description = "Nhận xét bản nhạc: chấm sao 1-5 và bình luận")
public class ScoreReviewController {

    ScoreReviewService reviewService;

    @GetMapping
    @Operation(
            summary = "Reviews of a score with the average rating (needs view access)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ReviewListResponse> getReviews(@PathVariable String scoreId) {
        return ok(reviewService.getReviews(scoreId));
    }

    @PutMapping("/me")
    @Operation(
            summary = "Create or update my review (needs review access: reviewer, editor, owner or ADMIN)",
            description = "Needs a rating (1-5) and/or a comment. Errors: 2410 bad rating, 2411 comment too long,"
                    + " 2412 empty review",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ReviewListResponse> saveMyReview(
            @PathVariable String scoreId, @Valid @RequestBody ReviewRequest request) {
        return ok(reviewService.saveMyReview(scoreId, request.getRating(), request.getComment()));
    }

    @DeleteMapping("/{reviewId}")
    @Operation(
            summary = "Delete a review (its author, the score owner or ADMIN)",
            description = "Errors: 2413 review not found",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ReviewListResponse> deleteReview(@PathVariable String scoreId, @PathVariable String reviewId) {
        return ok(reviewService.deleteReview(scoreId, reviewId));
    }

    private static <T> ApiResponse<T> ok(T result) {
        return ApiResponse.<T>builder().result(result).build();
    }
}
