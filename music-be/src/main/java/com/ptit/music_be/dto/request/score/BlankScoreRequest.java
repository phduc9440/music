package com.ptit.music_be.dto.request.score;

import com.ptit.music_be.dto.enums.score.BlankPreset;
import com.ptit.music_be.dto.enums.score.KeyMode;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Tạo bản nhạc trống (mục 9, B3). Mọi giá trị được kiểm ở service; sai tùy chọn là lỗi 3302. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class BlankScoreRequest {
    /** Tiêu đề, 1 đến 255 ký tự sau khi bỏ khoảng trắng hai đầu. */
    String title;
    /** Tác giả, tối đa 255 ký tự; tùy chọn. */
    String composer;

    BlankPreset preset;
    /** Số dấu hóa của khóa, từ -7 (dấu giáng) đến 7 (dấu thăng). */
    Integer keyFifths;

    KeyMode mode;
    /** Tử số chỉ nhịp, 1 đến 12. */
    Integer beats;
    /** Mẫu số chỉ nhịp: 2, 4, 8 hoặc 16. */
    Integer beatType;

    Integer tempoBpm;
    /** Số ô nhịp, 1 đến 200. */
    Integer measures;
}
