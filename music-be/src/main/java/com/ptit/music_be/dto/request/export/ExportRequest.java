package com.ptit.music_be.dto.request;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Body của {@code POST /api/scores/{scoreId}/exports}. {@code options} phụ thuộc định dạng (xem Swagger). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ExportRequest {
    /** MP3, WAV (các định dạng khác thêm ở nhánh export-formats). */
    String targetFormat;

    /** Ví dụ {"bitrate":192,"tempoPercent":75,"transpose":2,"hands":"BOTH"}; bỏ trống thì dùng mặc định. */
    JsonNode options;
}
