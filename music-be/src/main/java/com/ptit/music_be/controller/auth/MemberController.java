package com.ptit.music_be.controller;

import jakarta.validation.Valid;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.request.UpdateProfileRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.MemberResponse;
import com.ptit.music_be.service.MemberService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping({"/api/members", "/api/users"})
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Members", description = "APIs for member management")
public class MemberController {

    MemberService memberService;

    @GetMapping("/me")
    @Operation(summary = "Get current logged-in member info", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MemberResponse> getMyInfo() {
        return ApiResponse.<MemberResponse>builder()
                .result(memberService.getMyInfo())
                .build();
    }

    @PutMapping("/me")
    @Operation(
            summary = "Update my profile (fullName, phone, address)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MemberResponse> updateMyProfile(@RequestBody @Valid UpdateProfileRequest request) {
        return ApiResponse.<MemberResponse>builder()
                .result(memberService.updateMyProfile(request))
                .build();
    }

    @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload my avatar (JPG/PNG, max 2MB)", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MemberResponse> uploadAvatar(@RequestParam("file") MultipartFile file) {
        return ApiResponse.<MemberResponse>builder()
                .result(memberService.uploadAvatar(file))
                .build();
    }

    @DeleteMapping("/me/avatar")
    @Operation(summary = "Remove my avatar", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<MemberResponse> deleteAvatar() {
        return ApiResponse.<MemberResponse>builder()
                .result(memberService.deleteAvatar())
                .build();
    }
}
