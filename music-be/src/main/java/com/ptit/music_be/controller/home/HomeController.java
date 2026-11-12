package com.ptit.music_be.controller.home;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.home.HomeSummaryResponse;
import com.ptit.music_be.service.home.HomeService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/home")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Home", description = "Trang làm việc của người đã đăng nhập")
public class HomeController {

    HomeService homeService;

    @GetMapping("/summary")
    @Operation(
            summary = "Signed-in home: streak, recent scores, pending requests, practice suggestion (one call)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<HomeSummaryResponse> getSummary() {
        return ApiResponse.<HomeSummaryResponse>builder()
                .result(homeService.getSummary())
                .build();
    }
}
