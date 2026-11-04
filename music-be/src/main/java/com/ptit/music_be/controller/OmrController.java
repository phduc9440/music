package com.ptit.music_be.controller;

import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.ptit.music_be.dto.request.OmrRetryRequest;
import com.ptit.music_be.dto.response.AiTaskResponse;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.OmrResultResponse;
import com.ptit.music_be.dto.response.OmrUploadResponse;
import com.ptit.music_be.service.OmrService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "OMR", description = "Optical Music Recognition: upload sheet music PDF / images")
public class OmrController {

    OmrService omrService;

    @PostMapping(value = "/omr/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Upload one PDF (1-20 pages) or 1-20 images (PNG/JPG/JPEG, in page order) for OMR",
            description = "Errors: 2003 empty file, 2004 wrong type, 2005 too large, 2006 invalid combination,"
                    + " 2008 PDF encrypted/unreadable, 2009 PDF pages not in 1-20, 2010 image resolution,"
                    + " 2011 invalid sourceType, 2018 composer too long, 2202 already 3 OMR tasks running",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<OmrUploadResponse> upload(
            @RequestPart("files") List<MultipartFile> files,
            @Parameter(description = "Score title, defaults to the first file name")
                    @RequestParam(value = "title", required = false)
                    String title,
            @Parameter(description = "Composer, at most 255 characters")
                    @RequestParam(value = "composer", required = false)
                    String composer,
            @Parameter(description = "PHOTO / SCAN / PDF_NATIVE. Empty: PDF -> PDF_NATIVE, images -> PHOTO")
                    @RequestParam(value = "sourceType", required = false)
                    String sourceType) {
        return ApiResponse.<OmrUploadResponse>builder()
                .result(omrService.upload(files, title, composer, sourceType))
                .build();
    }

    @PostMapping("/scores/{scoreId}/omr/retry")
    @Operation(
            summary = "Chạy lại OMR trên file gốc đã lưu (tạo task OMR mới)",
            description = "Cần quyền sửa bản nhạc. Errors: 2001 không có bản nhạc, 1002 không có quyền,"
                    + " 2201 bản nhạc đang có task OMR chờ hoặc đang chạy, 2202 đã có 3 task OMR đang chạy,"
                    + " 2002 file gốc không còn",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<AiTaskResponse> retry(
            @PathVariable String scoreId,
            @Parameter(description = "Tùy chọn, ví dụ {\"preprocess\": false}. Bỏ trống: dùng lại lựa chọn lần trước")
                    @RequestBody(required = false)
                    OmrRetryRequest request) {
        return ApiResponse.<AiTaskResponse>builder()
                .result(omrService.retry(scoreId, request))
                .build();
    }

    @GetMapping("/scores/{scoreId}/omr/result")
    @Operation(
            summary = "Kết quả nhận diện mới nhất: cảnh báo, ảnh từng trang, id file kern/MusicXML/MIDI hiện hành",
            description = "Cần quyền xem bản nhạc. Errors: 2001 không có bản nhạc, 1002 không có quyền,"
                    + " 2101 bản nhạc chưa có tác vụ OMR nào",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<OmrResultResponse> getResult(@PathVariable String scoreId) {
        return ApiResponse.<OmrResultResponse>builder()
                .result(omrService.getResult(scoreId))
                .build();
    }
}
