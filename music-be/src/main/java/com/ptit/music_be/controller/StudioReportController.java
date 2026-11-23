package com.ptit.music_be.controller;

import java.util.Optional;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.enums.StudioMode;
import com.ptit.music_be.dto.response.StudioSessionReportResponse;
import com.ptit.music_be.dto.response.StudioSessionSummaryResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.service.StudioReportService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/studio")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Practice Studio Reports", description = "Báo cáo và lịch sử phiên luyện tập tương tác")
public class StudioReportController {

    StudioReportService studioReportService;

    @GetMapping("/sessions")
    @Operation(summary = "Lấy lịch sử phiên luyện tập", security = @SecurityRequirement(name = "bearerAuth"))
    public PageResponse<StudioSessionSummaryResponse> getSessions(
            @RequestParam(required = false) String scoreId,
            @RequestParam(required = false) StudioMode mode,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return studioReportService.getSessions(scoreId, mode, page, size);
    }

    @GetMapping("/sessions/{sessionId}/report")
    @Operation(summary = "Lấy báo cáo một phiên", security = @SecurityRequirement(name = "bearerAuth"))
    public StudioSessionReportResponse getReport(@PathVariable String sessionId) {
        return studioReportService.getReport(sessionId);
    }

    @GetMapping("/scores/{scoreId}/best")
    @Operation(summary = "Lấy phiên có điểm cao nhất", security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<StudioSessionReportResponse> getBestSession(@PathVariable String scoreId) {
        Optional<StudioSessionReportResponse> response = studioReportService.getBestSession(scoreId);
        return response.map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
