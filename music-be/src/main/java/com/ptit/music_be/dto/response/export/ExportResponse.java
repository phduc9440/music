package com.ptit.music_be.dto.response;

import java.util.List;

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
    /** Với SVG đã có sẵn: tất cả các trang theo thứ tự (file là trang đầu). */
    List<ExportFileResponse> files;

    AiTaskResponse task;
}
