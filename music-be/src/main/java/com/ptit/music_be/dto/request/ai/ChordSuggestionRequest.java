package com.ptit.music_be.dto.request.ai;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Body của {@code POST /api/scores/{scoreId}/chord-suggestions}: màu hợp âm NATURAL (mặc định), SIMPLE, COLORFUL hoặc JAZZY; {@code replaceExisting}
 * = true thì bỏ hết hợp âm đang có và gợi ý lại toàn bộ (mặc định chỉ gợi ý cho ô chưa có hợp âm).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ChordSuggestionRequest {
    String style;
    Boolean replaceExisting;
    /** SAFE, BALANCED (mặc định) hoặc BOLD. */
    String creativity;
    /** SPARSE, NORMAL (mặc định) hoặc DENSE. */
    String density;
    /**
     * Bè giai điệu cần hợp âm: chỉ số part từ 0 (theo thứ tự part trong bản nhạc, như trình chỉnh sửa). Bỏ trống thì lấy
     * part đầu tiên có nốt có cao độ.
     */
    Integer melodyPart;
    /** Khuông giai điệu trong part đó, từ 1. Bỏ trống thì khuông 1. */
    Integer melodyStaff;
}
