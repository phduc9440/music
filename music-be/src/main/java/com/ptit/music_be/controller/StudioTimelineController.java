package com.ptit.music_be.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.StudioTimelineResponse;
import com.ptit.music_be.service.StudioTimelineService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/studio/scores")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Practice Studio", description = "Dữ liệu bản nhạc phục vụ luyện tập tương tác")
public class StudioTimelineController {

    StudioTimelineService studioTimelineService;

    @GetMapping("/{scoreId}/timeline")
    @Operation(
            summary = "Lấy timeline nốt của bản nhạc cho Studio",
            security = @SecurityRequirement(name = "bearerAuth"))
    public StudioTimelineResponse getTimeline(@PathVariable String scoreId) {
        return studioTimelineService.getTimeline(scoreId);
    }
}
