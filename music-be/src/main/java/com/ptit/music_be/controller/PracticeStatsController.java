package com.ptit.music_be.controller;

import java.time.LocalDate;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PracticeHeatmapDayResponse;
import com.ptit.music_be.dto.response.PracticeSkillsResponse;
import com.ptit.music_be.dto.response.PracticeStreakResponse;
import com.ptit.music_be.dto.response.PracticeTimeBucketResponse;
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

    @GetMapping("/time")
    @Operation(
            summary = "My practice time per DAY / WEEK / MONTH (zero-filled, oldest first)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<PracticeTimeBucketResponse>> time(
            @RequestParam(defaultValue = "DAY") String period, @RequestParam(required = false) Integer count) {
        return ApiResponse.<List<PracticeTimeBucketResponse>>builder()
                .result(practiceStatsService.getTimeStats(period, count))
                .build();
    }

    @GetMapping("/skills")
    @Operation(
            summary = "My 4 skill scores (0-100) over the last N days, for the radar chart",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PracticeSkillsResponse> skills(@RequestParam(required = false) Integer days) {
        return ApiResponse.<PracticeSkillsResponse>builder()
                .result(practiceStatsService.getSkills(days))
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
