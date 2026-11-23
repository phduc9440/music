package com.ptit.music_be.controller.score;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.score.BlankScoreRequest;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.score.BlankScoreResponse;
import com.ptit.music_be.service.score.ScoreCreateService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/scores/blank")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Score create", description = "Create scores without uploading a file")
public class ScoreCreateController {

    ScoreCreateService scoreCreateService;

    @PostMapping
    @Operation(
            summary = "Create a blank score from an instrument preset",
            description = "Errors: 2017/2018 title or composer invalid, 3302 invalid options",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<BlankScoreResponse> createBlank(@RequestBody BlankScoreRequest request) {
        return ApiResponse.<BlankScoreResponse>builder()
                .result(scoreCreateService.createBlank(request))
                .build();
    }
}
