package com.ptit.music_be.controller.admin;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.OfficialRequestResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.service.score.OfficialRequestService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/official-requests")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Official requests", description = "Chỉ ROLE_ADMIN: các lời xin đưa bản nhạc vào kho score mẫu")
public class AdminOfficialRequestController {

    OfficialRequestService officialRequestService;

    @GetMapping
    @Operation(
            summary = "Requests to add scores to the curated library (newest first); status: PENDING|ACCEPTED|DECLINED|CANCELED",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<OfficialRequestResponse>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {
        return ApiResponse.<PageResponse<OfficialRequestResponse>>builder()
                .result(officialRequestService.getForAdmin(page, size, status))
                .build();
    }
}
