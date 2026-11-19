package com.ptit.music_be.controller.forum;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.forum.ForumPostRequest;
import com.ptit.music_be.dto.request.forum.ForumSubscriptionRequest;
import com.ptit.music_be.dto.request.forum.ForumThreadRequest;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.forum.ForumCategoryResponse;
import com.ptit.music_be.dto.response.forum.ForumPostResponse;
import com.ptit.music_be.dto.response.forum.ForumThreadDetailResponse;
import com.ptit.music_be.dto.response.forum.ForumThreadResponse;
import com.ptit.music_be.dto.response.forum.ForumVoteResponse;
import com.ptit.music_be.service.forum.ForumService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/forum")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Forum", description = "Diễn đàn: chuyên mục, chủ đề, trả lời, bình chọn (mục 5.5)")
public class ForumController {

    ForumService forumService;

    @GetMapping("/categories")
    @Operation(
            summary = "Forum categories with their thread counts",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<ForumCategoryResponse>> categories() {
        return ApiResponse.<List<ForumCategoryResponse>>builder()
                .result(forumService.categories())
                .build();
    }

    @GetMapping("/threads")
    @Operation(
            summary =
                    "Thread list (filters categoryId, keyword in title, unanswered, mine; sort LATEST by last activity or TOP by votes)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<ForumThreadResponse>> threads(
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "LATEST") ForumService.Sort sort,
            @RequestParam(defaultValue = "false") boolean unanswered,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.<PageResponse<ForumThreadResponse>>builder()
                .result(forumService.threads(categoryId, keyword, sort, unanswered, mine, page, size))
                .build();
    }

    @GetMapping("/threads/{threadId}")
    @Operation(
            summary = "Thread with its replies; the accepted answer comes first",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ForumThreadDetailResponse> thread(
            @PathVariable String threadId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String focusPostId) {
        return ApiResponse.<ForumThreadDetailResponse>builder()
                .result(forumService.thread(threadId, page, size, focusPostId))
                .build();
    }

    @PostMapping("/threads")
    @Operation(
            summary =
                    "Create a thread (title 3-150, body 1-10000 Markdown, optional public scoreId). Errors: 4104 invalid content, 4105 score not public, 4107 new account limit",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ForumThreadResponse> createThread(@Valid @RequestBody ForumThreadRequest request) {
        return ApiResponse.<ForumThreadResponse>builder()
                .result(forumService.createThread(request))
                .build();
    }

    @PutMapping("/threads/{threadId}")
    @Operation(summary = "Edit your own thread", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ForumThreadResponse> updateThread(
            @PathVariable String threadId, @Valid @RequestBody ForumThreadRequest request) {
        return ApiResponse.<ForumThreadResponse>builder()
                .result(forumService.updateThread(threadId, request))
                .build();
    }

    @DeleteMapping("/threads/{threadId}")
    @Operation(
            summary = "Delete your own thread unless others have replied (4108)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> deleteThread(@PathVariable String threadId) {
        forumService.deleteThread(threadId);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/threads/{threadId}/posts")
    @Operation(
            summary = "Reply to a thread; the thread author and followers are notified",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ForumPostResponse> reply(
            @PathVariable String threadId, @Valid @RequestBody ForumPostRequest request) {
        return ApiResponse.<ForumPostResponse>builder()
                .result(forumService.reply(threadId, request))
                .build();
    }

    @PutMapping("/posts/{postId}")
    @Operation(summary = "Edit your own reply", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ForumPostResponse> updatePost(
            @PathVariable String postId, @Valid @RequestBody ForumPostRequest request) {
        return ApiResponse.<ForumPostResponse>builder()
                .result(forumService.updatePost(postId, request))
                .build();
    }

    @DeleteMapping("/posts/{postId}")
    @Operation(summary = "Delete your own reply", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> deletePost(@PathVariable String postId) {
        forumService.deletePost(postId);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/threads/{threadId}/vote")
    @Operation(
            summary = "Toggle your vote on a thread (4110 for your own thread)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ForumVoteResponse> voteThread(@PathVariable String threadId) {
        return ApiResponse.<ForumVoteResponse>builder()
                .result(forumService.toggleThreadVote(threadId))
                .build();
    }

    @PostMapping("/posts/{postId}/vote")
    @Operation(
            summary = "Toggle your vote on a reply (4110 for your own reply)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ForumVoteResponse> votePost(@PathVariable String postId) {
        return ApiResponse.<ForumVoteResponse>builder()
                .result(forumService.togglePostVote(postId))
                .build();
    }

    @PostMapping("/posts/{postId}/accept")
    @Operation(
            summary =
                    "Thread author marks (or unmarks) a reply as the best answer; the reply author earns FORUM_ANSWER_ACCEPTED. Errors: 4106 not thread author, 4109 own reply",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ForumThreadResponse> accept(@PathVariable String postId) {
        return ApiResponse.<ForumThreadResponse>builder()
                .result(forumService.toggleAccepted(postId))
                .build();
    }

    @PutMapping("/threads/{threadId}/subscription")
    @Operation(
            summary = "Follow or unfollow a thread for reply notifications",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> subscribe(@PathVariable String threadId, @RequestBody ForumSubscriptionRequest request) {
        forumService.setSubscribed(threadId, request.isSubscribed());
        return ApiResponse.<Void>builder().build();
    }
}
