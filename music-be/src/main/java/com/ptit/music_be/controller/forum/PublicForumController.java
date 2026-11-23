package com.ptit.music_be.controller.forum;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.forum.ForumCategoryResponse;
import com.ptit.music_be.dto.response.forum.ForumThreadDetailResponse;
import com.ptit.music_be.dto.response.forum.ForumThreadResponse;
import com.ptit.music_be.service.forum.ForumService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Diễn đàn chỉ đọc cho khách chưa đăng nhập (SecurityConfig cho phép GET /api/public/**). Không có dấu cá nhân. */
@RestController
@RequestMapping("/api/public/forum")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Public forum", description = "Đọc diễn đàn không cần đăng nhập")
public class PublicForumController {

    ForumService forumService;

    @GetMapping("/categories")
    @Operation(summary = "Forum categories with thread counts")
    public ApiResponse<List<ForumCategoryResponse>> categories() {
        return ApiResponse.<List<ForumCategoryResponse>>builder()
                .result(forumService.categories())
                .build();
    }

    @GetMapping("/threads")
    @Operation(summary = "Thread list for guests (filters categoryId, keyword, unanswered; sort LATEST or TOP)")
    public ApiResponse<PageResponse<ForumThreadResponse>> threads(
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "LATEST") ForumService.Sort sort,
            @RequestParam(defaultValue = "false") boolean unanswered,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.<PageResponse<ForumThreadResponse>>builder()
                .result(forumService.publicThreads(categoryId, keyword, sort, unanswered, page, size))
                .build();
    }

    @GetMapping("/threads/{threadId}")
    @Operation(summary = "A thread with its replies for guests; the accepted answer comes first")
    public ApiResponse<ForumThreadDetailResponse> thread(
            @PathVariable String threadId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String focusPostId) {
        return ApiResponse.<ForumThreadDetailResponse>builder()
                .result(forumService.publicThread(threadId, page, size, focusPostId))
                .build();
    }
}
