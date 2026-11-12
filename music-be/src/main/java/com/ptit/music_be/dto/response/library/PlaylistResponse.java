package com.ptit.music_be.dto.response.library;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlaylistResponse {
    String id;
    String name;
    String description;
    long scoreCount;
}
