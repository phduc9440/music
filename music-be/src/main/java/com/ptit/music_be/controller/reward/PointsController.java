package com.ptit.music_be.controller.reward;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.reward.PointsResponse;
import com.ptit.music_be.service.reward.PointsService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/points")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Points", description = "Điểm thưởng (7.5)")
public class PointsController {

    PointsService pointsService;

    @GetMapping("/me")
    @Operation(
            summary = "Điểm thưởng của tôi: tổng XP, số Nốt và 20 lần cộng gần nhất",
            description = "Điểm chỉ đến từ sự kiện của hệ thống (RewardEarnedEvent), không có API tự cộng.",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PointsResponse> mine() {
        return ApiResponse.<PointsResponse>builder().result(pointsService.mine()).build();
    }
}
