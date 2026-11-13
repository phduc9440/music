package com.ptit.music_be.controller.score;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.enums.score.SuggestionFilter;
import com.ptit.music_be.dto.request.score.SuggestionDecisionRequest;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.score.SuggestionDetailResponse;
import com.ptit.music_be.dto.response.score.SuggestionSummaryResponse;
import com.ptit.music_be.service.score.SuggestionService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(
        name = "Score suggestions",
        description = "Đề xuất sửa bản nhạc (mục 4.3): gửi, xem, nhận từng ô, từ chối, rút lại")
public class ScoreSuggestionController {

    SuggestionService suggestionService;

    private static <T> ApiResponse<T> ok(T result) {
        return ApiResponse.<T>builder().result(result).build();
    }

    @PostMapping(value = "/scores/{scoreId}/suggestions", consumes = "multipart/form-data")
    @Operation(
            summary = "Send a suggested edit as a MusicXML file (needs REVIEW); owner and editors are notified",
            description =
                    "Errors: 3110 bad title/description, 3111 no change, 3112 too many open (10), 3117 over 30 per"
                            + " 24h, 2013 invalid MusicXML, 2201 score busy, 2801 base version gone",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<SuggestionDetailResponse> create(
            @PathVariable String scoreId,
            @RequestPart("file") MultipartFile file,
            @Parameter(description = "MusicXML version the file was edited from") @RequestParam Integer baseVersion,
            @RequestParam String title,
            @RequestParam(required = false) String description) {
        return ok(suggestionService.create(scoreId, file, baseVersion, title, description));
    }

    @GetMapping("/scores/{scoreId}/suggestions")
    @Operation(
            summary = "Suggestions of a score, newest first (editors see all, reviewers only their own)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<SuggestionSummaryResponse>> list(
            @PathVariable String scoreId,
            @RequestParam(defaultValue = "ALL") SuggestionFilter status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ok(suggestionService.list(scoreId, status, page, size));
    }

    @GetMapping("/suggestions/{id}")
    @Operation(
            summary = "Suggestion detail with conflict and stale flags (author or editor)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<SuggestionDetailResponse> get(@PathVariable String id) {
        return ok(suggestionService.get(id));
    }

    @GetMapping("/suggestions/{id}/content")
    @Operation(
            summary = "MusicXML of the suggestion (author or editor)",
            description = "2002 when the file was cleaned up 30 days after the suggestion closed",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<byte[]> content(@PathVariable String id) {
        return ResponseEntity.ok()
                .contentType(ScoreContentController.MUSICXML_MEDIA_TYPE)
                .body(suggestionService.content(id));
    }

    @PostMapping("/suggestions/{id}/accept")
    @Operation(
            summary = "Accept chosen measures (all when changeIds is null) as a new version (needs EDIT)",
            description = "Header If-Match: \"v{currentVersion}\". Errors: 2014 version conflict, 3113 outdated,"
                    + " 3114 not open, 3116 bad change ids",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<SuggestionDetailResponse> accept(
            @PathVariable String id,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody(required = false) SuggestionDecisionRequest request) {
        return ok(suggestionService.accept(id, ifMatch, request));
    }

    @PostMapping("/suggestions/{id}/reject")
    @Operation(summary = "Reject a suggestion (needs EDIT)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<SuggestionDetailResponse> reject(
            @PathVariable String id, @RequestBody(required = false) SuggestionDecisionRequest request) {
        return ok(suggestionService.reject(id, request));
    }

    @DeleteMapping("/suggestions/{id}")
    @Operation(summary = "Withdraw my open suggestion", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> withdraw(@PathVariable String id) {
        suggestionService.withdraw(id);
        return ok(null);
    }
}
