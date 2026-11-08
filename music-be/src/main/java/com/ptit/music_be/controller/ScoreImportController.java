package com.ptit.music_be.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ScoreImportResponse;
import com.ptit.music_be.service.ScoreImportService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/scores/import")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Score import", description = "Import MusicXML / MIDI directly (no OMR)")
public class ScoreImportController {

    ScoreImportService scoreImportService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Import one MusicXML (.musicxml/.xml/.mxl) or MIDI (.mid/.midi) file",
            description = "Errors: 2003 empty file, 2012 invalid MusicXML, 2013 invalid MIDI,"
                    + " 2014 unsupported type, 2017/2018 title or composer too long",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreImportResponse> importScore(
            @RequestPart("file") MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "composer", required = false) String composer) {
        return ApiResponse.<ScoreImportResponse>builder()
                .result(scoreImportService.importScore(file, title, composer))
                .build();
    }
}
