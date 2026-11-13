package com.ptit.music_be.dto.response.score;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Bản nhạc trống vừa tạo; web mở thẳng trình chỉnh sửa. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class BlankScoreResponse {
    String scoreId;
    /** Version MusicXML đầu tiên (luôn là 1). */
    int version;
}
