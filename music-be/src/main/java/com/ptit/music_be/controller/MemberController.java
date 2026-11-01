package com.ptit.music_be.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
