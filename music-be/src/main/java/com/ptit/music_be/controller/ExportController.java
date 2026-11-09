package com.ptit.music_be.controller;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.ExportRequest;
import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ExportFileResponse;
import com.ptit.music_be.dto.response.ExportResponse;
import com.ptit.music_be.service.ExportService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@RestController
@RequestMapping("/api/scores/{scoreId}/exports")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Export", description = "Xuất bản nhạc ra MP3, WAV (và các định dạng khác) bằng MuseScore")
public class ExportController {

    ExportService exportService;

    @PostMapping
    @Operation(
            summary = "Yêu cầu xuất file. Có file cùng tùy chọn thì trả ngay (cached), không thì tạo task chạy nền",
            description = "Body: {\"targetFormat\":\"MP3\",\"options\":{\"bitrate\":192,\"tempoPercent\":75,"
                    + "\"transpose\":2,\"hands\":\"BOTH\"}}. bitrate chỉ cho MP3 (128/192/320), tempoPercent 20-200,"
                    + " transpose -12..12, hands RIGHT/LEFT chỉ khi bản nhạc có đúng 2 khuông. Theo dõi task bằng"
                    + " GET /api/ai-tasks/{id}. Errors: 1002 không có quyền xem, 2001 không có bản nhạc,"
                    + " 2012 chưa có MusicXML, 2701 tùy chọn sai, 2702 bản nhạc quá dài (tối đa 20 phút),"
                    + " 2703 quá giới hạn (2 task đang chạy / 10 task mỗi giờ), 2704 máy chủ chưa cấu hình MuseScore",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ExportResponse> requestExport(
            @PathVariable String scoreId, @RequestBody(required = false) ExportRequest request) {
        return ApiResponse.<ExportResponse>builder()
                .result(exportService.requestExport(scoreId, request))
                .build();
    }

    @GetMapping
    @Operation(
            summary = "File xuất còn trên đĩa của bản nhạc, kèm tùy chọn và cờ outdated (bản nhạc đã sửa sau lúc xuất)",
            description = "Errors: 1002 không có quyền xem, 2001 không có bản nhạc",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<ExportFileResponse>> listExports(@PathVariable String scoreId) {
        return ApiResponse.<List<ExportFileResponse>>builder()
                .result(exportService.listExports(scoreId))
                .build();
    }
}
