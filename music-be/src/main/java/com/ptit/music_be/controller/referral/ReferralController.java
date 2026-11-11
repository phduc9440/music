package com.ptit.music_be.controller.referral;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ReferralResponse;
import com.ptit.music_be.service.referral.ReferralService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/referrals")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Referrals", description = "Mời bạn đăng ký (7.5)")
public class ReferralController {

    ReferralService referralService;

    @GetMapping("/me")
    @Operation(
            summary = "Mã giới thiệu của tôi (sinh lần đầu khi gọi) và số người đã mời",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ReferralResponse> mine() {
        return ApiResponse.<ReferralResponse>builder()
                .result(referralService.mine())
                .build();
    }
}
