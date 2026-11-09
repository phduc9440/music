package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.fasterxml.jackson.databind.JsonNode;
import com.ptit.music_be.dto.enums.FileType;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một file xuất (MP3, WAV, PDF, SVG) kèm tùy chọn đã dùng và trạng thái còn mới hay không. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ExportFileResponse {
    String id;
    String scoreId;
    FileType fileType;
    String originalFileName;
    String contentType;
    Long sizeBytes;
    Integer pageNumber;
    LocalDateTime createdAt;
    /** Ví dụ /api/files/{id}/download */
    String downloadUrl;
    /** Tùy chọn đã dùng để xuất file này. */
    JsonNode options;
    /** Version MusicXML được dùng làm nguồn. */
    Integer sourceVersion;
    /** True khi bản nhạc đã được sửa sau lúc xuất (sourceVersion nhỏ hơn version hiện hành). */
    boolean outdated;
}
