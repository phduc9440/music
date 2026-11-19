package com.ptit.music_be.dto.request.ai;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Body của {@code POST /api/scores/{scoreId}/chord-suggestions}: phong cách POP, BALLAD hoặc JAZZ. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ChordSuggestionRequest {
    String style;
}
