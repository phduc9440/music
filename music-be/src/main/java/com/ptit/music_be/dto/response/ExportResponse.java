package com.ptit.music_be.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Kết quả yêu cầu xuất file: {@code cached = true} thì có {@code file} ngay, ngược lại có {@code task} để theo dõi. */
@JsonInclude(JsonInclude.Include.NON_NULL)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ExportResponse {
    boolean cached;
    ExportFileResponse file;
    AiTaskResponse task;
}
