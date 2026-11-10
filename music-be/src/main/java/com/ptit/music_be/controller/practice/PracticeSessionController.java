package com.ptit.music_be.controller.practice;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.PracticeSessionRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.PracticeSessionResponse;
import com.ptit.music_be.service.practice.PracticeSessionService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/practice-sessions")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Practice sessions", description = "Lịch sử phiên tập của thành viên hiện tại")
public class PracticeSessionController {

    PracticeSessionService practiceSessionService;

    @PostMapping
    @Operation(summary = "Save a practice session", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PracticeSessionResponse> create(@RequestBody PracticeSessionRequest request) {
        return ApiResponse.<PracticeSessionResponse>builder()
                .result(practiceSessionService.create(request))
                .build();
    }

    @GetMapping
    @Operation(
            summary = "My practice history (newest first, optionally for one score)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<PracticeSessionResponse>> list(
            @RequestParam(required = false) String scoreId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.<PageResponse<PracticeSessionResponse>>builder()
                .result(practiceSessionService.getMySessions(scoreId, page, size))
                .build();
    }

    @GetMapping("/{id}")
    @Operation(
            summary = "One of my practice sessions (with error log)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PracticeSessionResponse> get(@PathVariable String id) {
        return ApiResponse.<PracticeSessionResponse>builder()
                .result(practiceSessionService.getSession(id))
                .build();
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete one of my practice sessions", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> delete(@PathVariable String id) {
        practiceSessionService.delete(id);
        return ApiResponse.<Void>builder().build();
    }
}
