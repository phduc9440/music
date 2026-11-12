package com.ptit.music_be.controller.score;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.enums.CommentStatus;
import com.ptit.music_be.dto.request.ScoreCommentReplyRequest;
import com.ptit.music_be.dto.request.ScoreCommentRequest;
import com.ptit.music_be.dto.request.ScoreCommentUpdateRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.CommentMemberResponse;
import com.ptit.music_be.dto.response.ScoreCommentResponse;
import com.ptit.music_be.dto.response.ScoreCommentsResponse;
import com.ptit.music_be.service.score.ScoreCommentService;

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
@Tag(name = "Score comments", description = "Góp ý gắn vào ô nhịp (mục 4.2): góp ý, trả lời, @nhắc tên, đã xử lý")
public class ScoreCommentController {

    ScoreCommentService commentService;

    private static <T> ApiResponse<T> ok(T result) {
        return ApiResponse.<T>builder().result(result).build();
    }

    @GetMapping("/scores/{scoreId}/comments")
    @Operation(
            summary = "Comments of a score with replies and filter counts (needs VIEW)",
            description = "status: OPEN / RESOLVED (omit for all); mentioned=true: only threads that mention me",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreCommentsResponse> list(
            @PathVariable String scoreId,
            @RequestParam(required = false) CommentStatus status,
            @RequestParam(defaultValue = "false") boolean mentioned) {
        return ok(commentService.list(scoreId, status, mentioned));
    }

    @PostMapping("/scores/{scoreId}/comments")
    @Operation(
            summary = "Comment on a range of measures (needs REVIEW); mentioned people are notified",
            description = "Errors: 3902 content 1-2000 chars, 3903 measures out of range, 3904 needs REVIEW,"
                    + " 3906 mention not allowed, 3907 bad part / note ids",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreCommentResponse> create(
            @PathVariable String scoreId, @RequestBody ScoreCommentRequest request) {
        return ok(commentService.create(scoreId, request));
    }

    @GetMapping("/scores/{scoreId}/comments/mentionable")
    @Operation(
            summary = "People who can be @mentioned on this score (owner, shares, team; public: past commenters)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<CommentMemberResponse>> mentionable(
            @PathVariable String scoreId,
            @Parameter(description = "Lọc theo tên (chứa) hoặc email (bắt đầu bằng)") @RequestParam(required = false)
                    String q) {
        return ok(commentService.mentionable(scoreId, q));
    }

    @PostMapping("/comments/{commentId}/replies")
    @Operation(
            summary = "Reply to a comment (needs REVIEW); returns the whole thread",
            description = "Replying to a reply attaches to its root comment. The root author and earlier repliers"
                    + " get COMMENT_REPLY",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreCommentResponse> reply(
            @PathVariable String commentId, @RequestBody ScoreCommentReplyRequest request) {
        return ok(commentService.reply(commentId, request));
    }

    @PatchMapping("/comments/{commentId}")
    @Operation(
            summary = "Edit content / mentions (author) or mark resolved / reopen (author, owner, EDIT); returns the thread",
            description = "Errors: 3901 not found, 3905 not allowed",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreCommentResponse> update(
            @PathVariable String commentId, @RequestBody ScoreCommentUpdateRequest request) {
        return ok(commentService.update(commentId, request));
    }

    @DeleteMapping("/comments/{commentId}")
    @Operation(
            summary = "Delete a comment (author or score owner); deleting a root comment deletes its replies",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String commentId) {
        commentService.delete(commentId);
        return ApiResponse.<Void>builder().build();
    }
}
