package com.ptit.music_be.dto.request.ai;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Body của {@code POST /api/scores/{scoreId}/chord-suggestions}: phong cách POP, BALLAD, JAZZ, CLASSICAL, FOLK, BOLERO hoặc BLUES; {@code replaceExisting}
 * = true thì bỏ hết hợp âm đang có và gợi ý lại toàn bộ (mặc định chỉ gợi ý cho ô chưa có hợp âm).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ChordSuggestionRequest {
    String style;
    Boolean replaceExisting;
}
