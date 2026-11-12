package com.ptit.music_be.controller.admin;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.admin.AnnouncementRequest;
import com.ptit.music_be.dto.response.admin.AnnouncementResponse;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.service.admin.AdminAnnouncementService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/announcements")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Announcements", description = "Chỉ ROLE_ADMIN: gửi thông báo chung tới người dùng")
public class AdminAnnouncementController {

    AdminAnnouncementService adminAnnouncementService;

    @PostMapping
    @Operation(
            summary =
                    "Send a notification to ALL / USERS (non-admins) / ADMINS / SELECTED (memberIds, max 200) - active accounts only, max 500 chars",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AnnouncementResponse> send(@Valid @RequestBody AnnouncementRequest request) {
        return ApiResponse.<AnnouncementResponse>builder()
                .result(adminAnnouncementService.send(request))
                .build();
    }
}
