package com.ptit.music_be.controller.export;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.http.ContentDisposition;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.ptit.music_be.dto.request.export.ExportRequest;
import com.ptit.music_be.dto.response.common.ApiResponse;
import com.ptit.music_be.dto.response.export.ExportFileResponse;
import com.ptit.music_be.dto.response.export.ExportResponse;
import com.ptit.music_be.service.export.ExportService;

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
            description =
                    "Định dạng: MP3, WAV (nhạc), PDF (options: pageSize A4/LETTER, orientation PORTRAIT/LANDSCAPE, staffSpaceMm 1.5-2.2,"
                            + " marginMm 10-25, showTitle, measureNumbers SYSTEM/EVERY/NONE, showChords), SVG (mọi trang, tải ZIP qua /exports/{taskId}/zip), MIDI và MUSICXML"
                            + " (trả file hiện hành ngay, không cần options). Body: {\"targetFormat\":\"MP3\",\"options\":{\"bitrate\":192,\"tempoPercent\":75,"
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

    @GetMapping("/{taskId}/zip")
    @Operation(
            summary = "ZIP chứa mọi trang SVG của một lần xuất (tên trang {tiêu đề}-trang-01.svg)",
            description = "Cần quyền xem bản nhạc. Errors: 1002 không có quyền xem, 2001 không có bản nhạc,"
                    + " 2002 tác vụ không có trang SVG nào còn trên đĩa",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<byte[]> zipSvgPages(@PathVariable String scoreId, @PathVariable String taskId) {
        ExportService.SvgZip zip = exportService.zipSvgPages(scoreId, taskId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(
                        "Content-Disposition",
                        ContentDisposition.attachment()
                                .filename(zip.fileName(), StandardCharsets.UTF_8)
                                .build()
                                .toString())
                .body(zip.content());
    }
}
