package com.ptit.music_be.controller.score;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.TrashedScoreResponse;
import com.ptit.music_be.service.score.ScoreTrashService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/scores")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Score trash", description = "Deleted scores stay in the trash for 30 days before they are removed")
public class ScoreTrashController {

    ScoreTrashService scoreTrashService;

    @GetMapping("/trash")
    @Operation(
            summary = "My trashed scores (newest deletion first), with deletedAt and purgeAt",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<PageResponse<TrashedScoreResponse>> getMyTrash(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "12") int size) {
        return ApiResponse.<PageResponse<TrashedScoreResponse>>builder()
                .result(scoreTrashService.getMyTrash(page, size))
                .build();
    }

    @PostMapping("/{scoreId}/restore")
    @Operation(
            summary = "Owner: restore a score from the trash",
            description = "Errors: 3301 the score is not in my trash",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> restore(@PathVariable String scoreId) {
        scoreTrashService.restore(scoreId);
        return ApiResponse.<Void>builder().message("Score restored").build();
    }

    @DeleteMapping("/{scoreId}/purge")
    @Operation(
            summary = "Owner: permanently delete a score that is in the trash",
            description = "Errors: 3301 the score is not in my trash",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<Void> purge(@PathVariable String scoreId) {
        scoreTrashService.purge(scoreId);
        return ApiResponse.<Void>builder().message("Score permanently deleted").build();
    }
}
