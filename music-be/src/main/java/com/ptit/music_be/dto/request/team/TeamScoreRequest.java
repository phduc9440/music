package com.ptit.music_be.dto.request;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Chuyển một bản nhạc cá nhân vào team (chỉ chủ bản đó). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamScoreRequest {
    String scoreId;
}
