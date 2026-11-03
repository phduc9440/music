package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.FileType;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreFileResponse {
    String id;
    String scoreId;
    FileType fileType;
    String originalFileName;
    String contentType;
    Long sizeBytes;
    Integer pageNumber;
    /** Phiên bản của file (MUSICXML tăng mỗi lần lưu). */
    Integer version;
    /** Có phải bản hiện hành không. */
    Boolean isCurrent;
    LocalDateTime createdAt;
    /** Relative to the API base, e.g. /api/files/{id}/download */
    String downloadUrl;
}
