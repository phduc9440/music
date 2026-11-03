package com.ptit.music_be.controller;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.OmrUploadResponse;
import com.ptit.music_be.service.OmrService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/omr")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "OMR", description = "Optical Music Recognition: upload sheet music PDF / images")
public class OmrController {

    OmrService omrService;

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Upload one PDF or 1-20 images (PNG/JPG/JPEG, in page order) for OMR",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<OmrUploadResponse> upload(
            @RequestPart("files") List<MultipartFile> files,
            @RequestParam(value = "title", required = false) String title) {
        return ApiResponse.<OmrUploadResponse>builder()
                .result(omrService.upload(files, title))
                .build();
    }
}
