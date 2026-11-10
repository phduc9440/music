package com.ptit.music_be.dto.response;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Giá trị có thật trong các bản công khai, để trang Khám phá chỉ hiện lựa chọn lọc ra kết quả. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ExploreFacetsResponse {
    /** Khóa nhạc, ví dụ "C", "G", "Am". */
    List<String> keys;
}
