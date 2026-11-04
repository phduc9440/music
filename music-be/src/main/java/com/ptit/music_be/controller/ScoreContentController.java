package com.ptit.music_be.controller;

import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.service.ScoreContentService;

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
@Tag(name = "Score content", description = "Nội dung kết quả của bản nhạc (kern, về sau MusicXML và MIDI)")
public class ScoreContentController {

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
}
