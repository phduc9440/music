package com.ptit.music_be.controller.score;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.score.ViewCountResponse;
import com.ptit.music_be.service.score.PlaybackService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/scores/{scoreId}")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Playback", description = "Phát nhạc: lượt xem và phiên nghe")
public class PlaybackController {

    PlaybackService playbackService;

    @PostMapping("/views")
    @Operation(
            summary = "Ghi nhận một lượt xem khi mở trang phát nhạc",
            description = "Chỉ tăng khi bản nhạc PUBLIC, người xem không phải chủ sở hữu và chưa được tính"
                    + " trong 30 phút gần đây; ngược lại trả tổng hiện tại với counted = false."
                    + " Errors: 2001 không có bản nhạc, 1002 không có quyền xem",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ViewCountResponse> recordView(@PathVariable String scoreId) {
        return ApiResponse.<ViewCountResponse>builder()
                .result(playbackService.recordView(scoreId))
                .build();
    }
}
