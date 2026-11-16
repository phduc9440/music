package com.ptit.music_be.controller.score;

import java.time.Duration;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.score.ScoreSummaryResponse;
import com.ptit.music_be.dto.response.library.TagResponse;
import com.ptit.music_be.service.library.TagService;
import com.ptit.music_be.service.score.PublicScoreFilter;
import com.ptit.music_be.service.score.ScoreService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Khám phá và trang bản nhạc công khai cho khách chưa đăng nhập (SecurityConfig cho phép GET /api/public/**). */
@RestController
@RequestMapping("/api/public/scores")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Public scores", description = "Khám phá bản nhạc công khai, không cần đăng nhập")
public class PublicScoreController {

    ScoreService scoreService;
    TagService tagService;

    @GetMapping
    @Operation(
            summary = "Explore for guests: same filters and sorting as GET /api/scores/public; PUBLIC scores only",
            description = "Cards carry ownerName (never the owner's email), viewCount, ratingAverage and ratingCount.")
    public ResponseEntity<ApiResponse<PageResponse<ScoreSummaryResponse>>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String tagId,
            @RequestParam(required = false) String composerId,
            @RequestParam(required = false) Integer staffs,
            @RequestParam(required = false) String key,
            @RequestParam(required = false) String sort) {
        PublicScoreFilter filter = new PublicScoreFilter(keyword, difficulty, tagId, composerId, staffs, key);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(ApiResponse.<PageResponse<ScoreSummaryResponse>>builder()
                        .result(scoreService.getPublicScores(page, size, filter, sort))
                        .build());
    }

    @GetMapping("/tags")
    @Operation(summary = "All tags, for the genre filter on the guest Explore page")
    public ApiResponse<java.util.List<TagResponse>> tags() {
        return ApiResponse.<java.util.List<TagResponse>>builder()
                .result(tagService.getAllTags())
                .build();
    }

    @GetMapping("/{scoreId}")
    @Operation(
            summary = "Card of one PUBLIC score for the guest page /s/:id (2001 when it is private, pending or deleted)")
    public ResponseEntity<ApiResponse<ScoreSummaryResponse>> get(@PathVariable String scoreId) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(ApiResponse.<ScoreSummaryResponse>builder()
                        .result(scoreService.getPublicScore(scoreId))
                        .build());
    }
}
