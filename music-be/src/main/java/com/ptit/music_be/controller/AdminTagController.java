package com.ptit.music_be.controller;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.TagRequest;
import com.ptit.music_be.dto.response.AdminTagResponse;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.service.AdminTagService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/admin/tags")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Admin - Tags", description = "Chỉ ROLE_ADMIN: quản lý thể loại (tag) của bản nhạc")
public class AdminTagController {

    AdminTagService adminTagService;

    @GetMapping
    @Operation(
            summary = "List all tags with the number of scores using each",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<AdminTagResponse>> list() {
        return ApiResponse.<List<AdminTagResponse>>builder()
                .result(adminTagService.getTags())
                .build();
    }

    @PostMapping
    @Operation(
            summary = "Create a tag (slug is generated from the name)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminTagResponse> create(@RequestBody TagRequest request) {
        return ApiResponse.<AdminTagResponse>builder()
                .result(adminTagService.create(request))
                .build();
    }

    @PutMapping("/{id}")
    @Operation(summary = "Rename a tag", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AdminTagResponse> update(@PathVariable String id, @RequestBody TagRequest request) {
        return ApiResponse.<AdminTagResponse>builder()
                .result(adminTagService.update(id, request))
                .build();
    }

    @DeleteMapping("/{id}")
    @Operation(
            summary = "Delete a tag and remove it from every score using it (scores are kept)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id) {
        adminTagService.delete(id);
        return ApiResponse.<Void>builder().build();
    }
}
