package com.ptit.music_be.controller;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.request.StudioEventBatchRequest;
import com.ptit.music_be.dto.request.StudioSessionCreateRequest;
import com.ptit.music_be.dto.request.StudioSessionFinishRequest;
import com.ptit.music_be.dto.response.StudioEventBatchResponse;
import com.ptit.music_be.dto.response.StudioSessionReportResponse;
import com.ptit.music_be.dto.response.StudioSessionResponse;
import com.ptit.music_be.service.StudioEventService;
import com.ptit.music_be.service.StudioReportService;
import com.ptit.music_be.service.StudioSessionService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/studio/sessions")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Practice Studio", description = "Vòng đời phiên luyện tập tương tác")
public class StudioSessionController {

    StudioSessionService studioSessionService;
    StudioEventService studioEventService;
    StudioReportService studioReportService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Tạo phiên luyện tập", security = @SecurityRequirement(name = "bearerAuth"))
    public StudioSessionResponse createSession(@Valid @RequestBody StudioSessionCreateRequest request) {
        return studioSessionService.createSession(request);
    }

    @GetMapping("/active")
    @Operation(summary = "Lấy phiên luyện tập đang chạy", security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<StudioSessionResponse> getActiveSession() {
        return studioSessionService
                .getActiveSession()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/{sessionId}/abort")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Hủy phiên luyện tập", security = @SecurityRequirement(name = "bearerAuth"))
    public void abortSession(@PathVariable String sessionId) {
        studioSessionService.abortSession(sessionId);
    }

    @PostMapping("/{sessionId}/finish")
    @Operation(summary = "Kết thúc phiên và tổng hợp báo cáo", security = @SecurityRequirement(name = "bearerAuth"))
    public StudioSessionReportResponse finishSession(
            @PathVariable String sessionId, @Valid @RequestBody StudioSessionFinishRequest request) {
        return studioReportService.finishSession(sessionId, request);
    }

    @PostMapping("/{sessionId}/events")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Gửi lô sự kiện nốt của phiên", security = @SecurityRequirement(name = "bearerAuth"))
    public StudioEventBatchResponse ingestEvents(
            @PathVariable String sessionId, @Valid @RequestBody StudioEventBatchRequest request) {
        return studioEventService.ingestEvents(sessionId, request);
    }
}
