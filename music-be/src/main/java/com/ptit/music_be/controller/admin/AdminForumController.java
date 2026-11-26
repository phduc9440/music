package com.ptit.music_be.controller.admin;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.admin.ForumCategoryRequest;
import com.ptit.music_be.dto.response.admin.AdminForumCategoryResponse;
import com.ptit.music_be.dto.response.admin.AdminForumThreadDetailResponse;
import com.ptit.music_be.dto.response.admin.AdminForumThreadResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.service.admin.AdminForumService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/forum")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Forum", description = "Quản lý diễn đàn (quyền FORUM_MANAGE)")
@PreAuthorize("@perm.has('FORUM_MANAGE')")
public class AdminForumController {

    AdminForumService forumService;

    @GetMapping("/categories")
    @Operation(
            summary = "Categories with thread counts (hidden threads included)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<AdminForumCategoryResponse>> categories() {
        return ApiResponse.<List<AdminForumCategoryResponse>>builder()
                .result(forumService.categories())
                .build();
    }

    @PostMapping("/categories")
    @Operation(
            summary =
                    "Create a category (name 2-100 chars, description up to 300; the slug is generated). Errors: 4113",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminForumCategoryResponse> createCategory(@RequestBody ForumCategoryRequest request) {
        return ApiResponse.<AdminForumCategoryResponse>builder()
                .result(forumService.createCategory(request))
                .build();
    }

    @PutMapping("/categories/order")
    @Operation(
            summary = "Reorder categories: the body is the list of category ids in the new order",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> reorder(@RequestBody List<String> orderedIds) {
        forumService.reorderCategories(orderedIds);
        return ApiResponse.<Void>builder().build();
    }

    @PutMapping("/categories/{id}")
    @Operation(summary = "Rename a category", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminForumCategoryResponse> updateCategory(
            @PathVariable String id, @RequestBody ForumCategoryRequest request) {
        return ApiResponse.<AdminForumCategoryResponse>builder()
                .result(forumService.updateCategory(id, request))
                .build();
    }

    @DeleteMapping("/categories/{id}")
    @Operation(
            summary = "Delete an empty category (4112 when it still has threads, hidden ones included)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> deleteCategory(@PathVariable String id) {
        forumService.deleteCategory(id);
        return ApiResponse.<Void>builder().build();
    }

    @GetMapping("/threads")
    @Operation(
            summary =
                    "All threads including hidden ones (filters keyword in title or author email, categoryId, status ALL|VISIBLE|HIDDEN|PINNED|LOCKED|REPORTED)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<AdminForumThreadResponse>> threads(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String categoryId,
            @RequestParam(defaultValue = "ALL") AdminForumService.Status status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.<PageResponse<AdminForumThreadResponse>>builder()
                .result(forumService.threads(keyword, categoryId, status, page, size))
                .build();
    }

    @GetMapping("/threads/{threadId}")
    @Operation(
            summary = "A thread with every reply, hidden ones included",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminForumThreadDetailResponse> thread(@PathVariable String threadId) {
        return ApiResponse.<AdminForumThreadDetailResponse>builder()
                .result(forumService.thread(threadId))
                .build();
    }

    @PutMapping("/threads/{threadId}/hidden")
    @Operation(
            summary = "Hide or restore a thread; hiding closes its pending reports",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> hideThread(@PathVariable String threadId, @RequestParam boolean value) {
        forumService.setThreadHidden(threadId, value);
        return ApiResponse.<Void>builder().build();
    }

    @PutMapping("/threads/{threadId}/pinned")
    @Operation(summary = "Pin or unpin a thread", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> pinThread(@PathVariable String threadId, @RequestParam boolean value) {
        forumService.setThreadPinned(threadId, value);
        return ApiResponse.<Void>builder().build();
    }

    @PutMapping("/threads/{threadId}/locked")
    @Operation(
            summary = "Lock or unlock a thread (a locked thread takes no new replies, 4111)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> lockThread(@PathVariable String threadId, @RequestParam boolean value) {
        forumService.setThreadLocked(threadId, value);
        return ApiResponse.<Void>builder().build();
    }

    @PutMapping("/posts/{postId}/hidden")
    @Operation(
            summary = "Hide or restore a reply; hiding clears its best-answer mark and closes its pending reports",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> hidePost(@PathVariable String postId, @RequestParam boolean value) {
        forumService.setPostHidden(postId, value);
        return ApiResponse.<Void>builder().build();
    }
}
