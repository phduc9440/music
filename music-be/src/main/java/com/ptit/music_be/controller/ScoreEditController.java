package com.ptit.music_be.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.ApiResponse;
import com.ptit.music_be.dto.response.ScoreSaveResponse;
import com.ptit.music_be.service.ScoreEditService;

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
@Tag(name = "Score edit", description = "Lưu chỉnh sửa MusicXML từ trình chỉnh sửa")
public class ScoreEditController {

    ScoreEditService scoreEditService;

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
            @RequestBody(required = false) byte[] body,
            @RequestHeader(value = HttpHeaders.CONTENT_TYPE, required = false) String contentType,
            @Parameter(description = "Version đang sửa, ví dụ \"v5\"")
                    @RequestHeader(value = HttpHeaders.IF_MATCH, required = false)
                    String ifMatch,
            @Parameter(description = "true để ghi đè dù version đã đổi (chỉ chủ sở hữu hoặc ADMIN)")
                    @RequestParam(defaultValue = "false")
                    boolean force) {
        ScoreSaveResponse saved = scoreEditService.saveMusicXml(scoreId, body, contentType, ifMatch, force);
        return ResponseEntity.ok()
                .eTag("\"v" + saved.getVersion() + "\"")
                .body(ApiResponse.<ScoreSaveResponse>builder().result(saved).build());
    }
}
