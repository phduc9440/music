package com.ptit.music_be.controller;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ScoreFileResponse;
import com.ptit.music_be.service.ScoreFileService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Score files", description = "List and download files attached to a score")
public class ScoreFileController {

    ScoreFileService scoreFileService;

    @GetMapping("/scores/{scoreId}/files")
    @Operation(summary = "List files of a score", security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<ScoreFileResponse>> getFilesOfScore(@PathVariable String scoreId) {
        return ApiResponse.<List<ScoreFileResponse>>builder()
                .result(scoreFileService.getFilesOfScore(scoreId))
                .build();
    }

    @GetMapping("/files/{fileId}/download")
    @Operation(
            summary = "Download a file (inline=true to display in browser)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<Resource> download(
            @PathVariable String fileId, @RequestParam(defaultValue = "false") boolean inline) {
        ScoreFileService.DownloadableFile file = scoreFileService.loadForDownload(fileId);

        ContentDisposition disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(file.fileName(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(file.resource());
    }
}
