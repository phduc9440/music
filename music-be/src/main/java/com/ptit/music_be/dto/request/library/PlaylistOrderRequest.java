package com.ptit.music_be.dto.request.library;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlaylistOrderRequest {
    /** Thứ tự mới của toàn bộ bài trong playlist. */
    List<String> scoreIds;
}
