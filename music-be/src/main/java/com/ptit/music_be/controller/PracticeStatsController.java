package com.ptit.music_be.controller;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PracticeHeatmapDayResponse;
import com.ptit.music_be.dto.response.PracticeStreakResponse;
import com.ptit.music_be.service.PracticeStatsService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/practice-stats")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Practice stats", description = "Chuỗi ngày luyện tập và heatmap của thành viên hiện tại")
public class PracticeStatsController {

    PracticeStatsService practiceStatsService;

    @GetMapping("/heatmap")
    @Operation(
            summary = "Days I practiced (default: last 365 days), oldest first",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<PracticeHeatmapDayResponse>> heatmap(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ApiResponse.<List<PracticeHeatmapDayResponse>>builder()
                .result(practiceStatsService.getHeatmap(from, to))
                .build();
    }

    @GetMapping("/streak")
    @Operation(summary = "My current and longest practice streak", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PracticeStreakResponse> streak() {
        return ApiResponse.<PracticeStreakResponse>builder()
                .result(practiceStatsService.getStreak())
                .build();
    }
}
