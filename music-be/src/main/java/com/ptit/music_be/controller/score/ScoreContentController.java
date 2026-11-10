package com.ptit.music_be.controller;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.response.ScoreContent;
import com.ptit.music_be.service.ScoreContentService;

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
@Tag(name = "Score content", description = "Nội dung kết quả của bản nhạc (kern, MusicXML, MIDI)")
public class ScoreContentController {

    /** Kiểu nội dung MusicXML theo tài liệu của W3C Music Notation Community Group. */
    static final MediaType MUSICXML_MEDIA_TYPE = MediaType.parseMediaType("application/vnd.recordare.musicxml+xml");

    static final MediaType MIDI_MEDIA_TYPE = MediaType.parseMediaType("audio/midi");

    ScoreContentService scoreContentService;

    @GetMapping(value = "/scores/{scoreId}/kern", produces = "text/plain;charset=UTF-8")
    @Operation(
            summary = "Chuỗi kern đã ghép của bản nhạc (text/plain, UTF-8)",
            description = "Cần quyền xem bản nhạc. Errors: 2001 không có bản nhạc, 1002 không có quyền,"
                    + " 2002 chưa có kern hoặc file đã mất",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<String> getKern(@PathVariable String scoreId) {
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
                .body(scoreContentService.getKern(scoreId));
    }

    @GetMapping("/scores/{scoreId}/musicxml")
    @Operation(
            summary = "MusicXML hiện hành của bản nhạc (application/vnd.recordare.musicxml+xml)",
            description = "Cần quyền xem bản nhạc. Header ETag có dạng \"v{version}\"; gửi lại qua If-None-Match thì"
                    + " trả 304 khi chưa có bản mới. Errors: 2001 không có bản nhạc, 1002 không có quyền,"
                    + " 2012 chưa có MusicXML, 2002 file đã mất",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<byte[]> getMusicXml(
            @PathVariable String scoreId,
            @Parameter(description = "ETag đã nhận lần trước, ví dụ \"v1\"")
                    @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false)
                    String ifNoneMatch) {
        ScoreContent content = scoreContentService.getMusicXml(scoreId);
        String etag = "\"v" + content.version() + "\"";
        if (matchesEtag(ifNoneMatch, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED)
                    .eTag(etag)
                    .cacheControl(CacheControl.noCache())
                    .build();
        }
        return ResponseEntity.ok()
                .contentType(MUSICXML_MEDIA_TYPE)
                .eTag(etag)
                .cacheControl(CacheControl.noCache())
                .body(content.bytes());
    }

    @GetMapping("/scores/{scoreId}/midi")
    @Operation(
            summary = "MIDI hiện hành của bản nhạc (audio/midi)",
            description = "Cần quyền xem bản nhạc. Nếu MIDI chưa có hoặc cũ hơn MusicXML thì sinh lại trước khi trả"
                    + " (đồng bộ, thường dưới 2 giây). Errors: 2001 không có bản nhạc, 1002 không có quyền,"
                    + " 2012 chưa có MusicXML, 2103 music-ai không sinh lại được, 2002 file đã mất",
            security = @SecurityRequirement(name = "bearerAuth"))
    public ResponseEntity<byte[]> getMidi(@PathVariable String scoreId) {
        ScoreContent content = scoreContentService.getMidi(scoreId);
        return ResponseEntity.ok()
                .contentType(MIDI_MEDIA_TYPE)
                .cacheControl(CacheControl.noCache())
                .body(content.bytes());
    }

    /** If-None-Match có thể chứa nhiều ETag, dạng yếu (W/"...") hoặc "*"; so khớp theo giá trị mạnh. */
    private static boolean matchesEtag(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) {
            return false;
        }
        return Arrays.stream(ifNoneMatch.split(","))
                .map(String::trim)
                .map(value -> value.startsWith("W/") ? value.substring(2) : value)
                .anyMatch(value -> value.equals("*") || value.equals(etag));
    }
}
