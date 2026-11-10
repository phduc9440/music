package com.ptit.music_be.controller.score;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ScoreContent;
import com.ptit.music_be.dto.response.ScoreDiffResponse;
import com.ptit.music_be.dto.response.ScoreSaveResponse;
import com.ptit.music_be.dto.response.ScoreVersionResponse;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.service.score.ScoreDiffService;
import com.ptit.music_be.service.score.ScoreEditService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.experimental.NonFinal;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Tag(name = "Score edit", description = "Lưu chỉnh sửa MusicXML từ trình chỉnh sửa")
public class ScoreEditController {

    ScoreEditService scoreEditService;
    ScoreDiffService scoreDiffService;

    @NonFinal
    @Value("${app.editor.max-musicxml-bytes:5242880}")
    long maxMusicXmlBytes;

    @PutMapping("/scores/{scoreId}/musicxml")
    @Operation(
            summary = "Lưu MusicXML mới thành version kế tiếp",
            description = "Body là MusicXML (Content-Type application/vnd.recordare.musicxml+xml, application/xml"
                    + " hoặc text/xml, tối đa 5MB). Bắt buộc header If-Match: \"v{currentVersion}\" (bỏ qua khi"
                    + " force=true). Trả ETag \"v{version mới}\". MIDI không sinh ngay mà được sinh lại ở lần tải MIDI"
                    + " kế tiếp. Errors: 2001 không có bản nhạc, 1002 không có quyền sửa (hoặc force mà không phải chủ"
                    + " sở hữu/ADMIN), 2005 body rỗng hoặc quá lớn, 2013 Content-Type hoặc nội dung MusicXML không hợp"
                    + " lệ, 2201 đang có tác vụ nhận diện, 2012 chưa có MusicXML, 2014 xung đột version"
                    + " (result.currentVersion là version mới nhất)",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<ApiResponse<ScoreSaveResponse>> saveMusicXml(
            @PathVariable String scoreId,
            HttpServletRequest request,
            @RequestHeader(value = HttpHeaders.CONTENT_TYPE, required = false) String contentType,
            @Parameter(description = "Version đang sửa, ví dụ \"v5\"")
                    @RequestHeader(value = HttpHeaders.IF_MATCH, required = false)
                    String ifMatch,
            @Parameter(description = "true để ghi đè dù version đã đổi (chỉ chủ sở hữu hoặc ADMIN)")
                    @RequestParam(defaultValue = "false")
                    boolean force) {
        byte[] body = readBoundedBody(request);
        ScoreSaveResponse saved = scoreEditService.saveMusicXml(scoreId, body, contentType, ifMatch, force);
        return ResponseEntity.ok()
                .eTag("\"v" + saved.getVersion() + "\"")
                .body(ApiResponse.<ScoreSaveResponse>builder().result(saved).build());
    }

    @GetMapping("/scores/{scoreId}/versions")
    @Operation(
            summary = "Lịch sử các phiên bản MusicXML còn giữ (tối đa 20), mới nhất trước",
            description = "Mỗi phần tử có version, createdAt, savedByName, measureCount, sizeBytes, isCurrent và"
                    + " source (EDITOR, OMR, IMPORT, RESTORE). Cần quyền xem bản nhạc. Errors: 2001 không có bản nhạc,"
                    + " 1002 không có quyền",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<List<ScoreVersionResponse>> listVersions(@PathVariable String scoreId) {
        return ApiResponse.<List<ScoreVersionResponse>>builder()
                .result(scoreEditService.listVersions(scoreId))
                .build();
    }

    @GetMapping("/scores/{scoreId}/versions/{version}")
    @Operation(
            summary = "MusicXML của một phiên bản cũ (để xem trước)",
            description = "Header ETag \"v{version}\". Cần quyền xem bản nhạc. Errors: 2001, 1002, 2801 phiên bản"
                    + " không còn (chỉ giữ 20 bản mới nhất), 2002 file đã mất",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<byte[]> getVersion(@PathVariable String scoreId, @PathVariable int version) {
        ScoreContent content = scoreEditService.getVersionContent(scoreId, version);
        return ResponseEntity.ok()
                .contentType(ScoreContentController.MUSICXML_MEDIA_TYPE)
                .eTag("\"v" + content.version() + "\"")
                .cacheControl(CacheControl.noCache())
                .body(content.bytes());
    }

    @GetMapping("/scores/{scoreId}/versions/{version}/diff")
    @Operation(
            summary = "So sánh một phiên bản MusicXML với bản gốc (mặc định là bản do nhận diện sinh ra)",
            description = "Đo công sửa sau khi số hóa: ô giữ nguyên, ô sửa, ô OMR sinh thừa (deleted), ô OMR bỏ sót"
                    + " (added) và lỗi nốt theo loại. Tham số base là version gốc, bỏ trống thì dùng bản OMR. Kết quả"
                    + " được lưu để lần sau trả ngay (cached = true). Errors: 2001, 1002, 2801, 2901 không có bản gốc,"
                    + " 2902 trùng version, 2903 không đọc được MusicXML, 2103 music-ai không khả dụng",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ApiResponse<ScoreDiffResponse> diffVersion(
            @PathVariable String scoreId,
            @PathVariable int version,
            @Parameter(description = "Version gốc để so; bỏ trống thì dùng bản do OMR sinh ra")
                    @RequestParam(required = false)
                    Integer base) {
        return ApiResponse.<ScoreDiffResponse>builder()
                .result(scoreDiffService.diff(scoreId, version, base))
                .build();
    }

    @PostMapping("/scores/{scoreId}/versions/{version}/restore")
    @Operation(
            summary = "Khôi phục một phiên bản cũ thành phiên bản mới nhất",
            description =
                    "Lưu nội dung của phiên bản được chọn thành version kế tiếp (lịch sử không bị ghi đè, vẫn giữ"
                            + " tối đa 20 bản). Bắt buộc header If-Match: \"v{currentVersion}\". MIDI tự sinh lại ở lần tải kế"
                            + " tiếp. Errors: 2001, 1002 không có quyền sửa, 2801 phiên bản không còn, 2014 xung đột version"
                            + " (result.currentVersion là version mới nhất), 2201 đang có tác vụ nhận diện, 2012 chưa có MusicXML",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<ApiResponse<ScoreSaveResponse>> restoreVersion(
            @PathVariable String scoreId,
            @PathVariable int version,
            @Parameter(description = "Version đang sửa, ví dụ \"v5\"")
                    @RequestHeader(value = HttpHeaders.IF_MATCH, required = false)
                    String ifMatch) {
        ScoreSaveResponse saved = scoreEditService.restoreVersion(scoreId, version, ifMatch);
        return ResponseEntity.ok()
                .eTag("\"v" + saved.getVersion() + "\"")
                .body(ApiResponse.<ScoreSaveResponse>builder().result(saved).build());
    }

    /**
     * Đọc body nhưng không bao giờ giữ quá {@code maxMusicXmlBytes + 1} byte trong RAM: Content-Length đã vượt giới hạn
     * thì từ chối ngay, còn không thì đọc có chặn (phòng body chunked không có Content-Length).
     */
    private byte[] readBoundedBody(HttpServletRequest request) {
        if (request.getContentLengthLong() > maxMusicXmlBytes) {
            throw new AppException(ErrorCode.FILE_TOO_LARGE);
        }
        try {
            byte[] body = request.getInputStream().readNBytes((int) Math.min(maxMusicXmlBytes + 1, Integer.MAX_VALUE));
            if (body.length > maxMusicXmlBytes) {
                throw new AppException(ErrorCode.FILE_TOO_LARGE);
            }
            return body;
        } catch (IOException e) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }
}
