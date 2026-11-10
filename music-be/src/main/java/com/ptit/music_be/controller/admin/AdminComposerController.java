package com.ptit.music_be.controller.admin;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.request.ComposerRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ComposerResponse;
import com.ptit.music_be.service.composer.ComposerService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Chỉ ROLE_ADMIN (SecurityConfig chặn /api/admin/**): quản lý nhạc sĩ. */
@RestController
@RequestMapping("/api/admin/composers")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Composers", description = "Chỉ ROLE_ADMIN: quản lý nhạc sĩ (mục 5.4)")
public class AdminComposerController {

    ComposerService composerService;

    @GetMapping
    @Operation(
            summary = "All composers with the number of linked scores",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<ComposerResponse>> list() {
        return ApiResponse.<List<ComposerResponse>>builder()
                .result(composerService.listForAdmin())
                .build();
    }

    @PostMapping
    @Operation(
            summary = "Create a composer (slug from the name); scores whose composer text matches are linked",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ComposerResponse> create(@RequestBody ComposerRequest request) {
        return ApiResponse.<ComposerResponse>builder()
                .result(composerService.create(request))
                .build();
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a composer and relink scores", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ComposerResponse> update(@PathVariable String id, @RequestBody ComposerRequest request) {
        return ApiResponse.<ComposerResponse>builder()
                .result(composerService.update(id, request))
                .build();
    }

    @DeleteMapping("/{id}")
    @Operation(
            summary = "Delete a composer (scores keep their composer text, only the link is removed)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id) {
        composerService.delete(id);
        return ApiResponse.<Void>builder().build();
    }

    @PostMapping("/relink")
    @Operation(
            summary = "Relink every score to composers by its composer text; returns how many changed",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Integer> relink() {
        return ApiResponse.<Integer>builder()
                .result(composerService.relinkAll())
                .build();
    }
}
