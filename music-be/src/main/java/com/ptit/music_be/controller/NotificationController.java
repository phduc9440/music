package com.ptit.music_be.controller;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.NotificationResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.service.NotificationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Notifications", description = "Thông báo trong ứng dụng của người đang đăng nhập")
public class NotificationController {

    NotificationService notificationService;

    @GetMapping
    @Operation(summary = "My notifications, newest first", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<NotificationResponse>> getMine(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.<PageResponse<NotificationResponse>>builder()
                .result(notificationService.getMine(page, size))
                .build();
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Number of unread notifications", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Long> unreadCount() {
        return ApiResponse.<Long>builder().result(notificationService.countUnread()).build();
    }

    @PostMapping("/{id}/read")
    @Operation(
            summary = "Mark one notification as read",
            description = "Errors: 2501 not found (or not yours)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> markRead(@PathVariable String id) {
        notificationService.markRead(id);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/read-all")
    @Operation(summary = "Mark all as read", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> markAllRead() {
        notificationService.markAllRead();
        return ApiResponse.<Void>builder().build();
    }
}
