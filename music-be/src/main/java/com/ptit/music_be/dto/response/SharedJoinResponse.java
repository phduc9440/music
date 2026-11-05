package com.ptit.music_be.dto.response;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Kết quả khi mở liên kết chia sẻ. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SharedJoinResponse {
    String scoreId;
    String title;
    /** Cấp truy cập của người mở: OWNER / EDIT / REVIEW / VIEW. */
    String accessLevel;
}
