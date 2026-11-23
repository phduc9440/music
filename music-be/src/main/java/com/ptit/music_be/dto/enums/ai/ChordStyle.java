package com.ptit.music_be.dto.enums.ai;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Màu hợp âm khi gợi ý (R3). Model AutoHarmonizer không có khái niệm thể loại, music-ai chỉ tăng / giảm xác suất các nhóm
 * hợp âm của model, nên các giá trị mô tả đúng việc đó thay vì gọi theo thể loại nhạc.
 */
public enum ChordStyle {
    /** Để model tự chọn. */
    NATURAL("Tự nhiên"),
    /** Ưu tiên hợp âm ba đơn giản. */
    SIMPLE("Đơn giản"),
    /** Ưu tiên maj7, m7, sus, 6. */
    COLORFUL("Có màu"),
    /** Ưu tiên hợp âm 7 và mở rộng 9, 11, 13. */
    JAZZY("Hợp âm 7 / Jazz");

    /** Tên phong cách cũ (đã bỏ) còn trong input_data của tác vụ cũ → màu tương ứng. */
    private static final Map<String, ChordStyle> LEGACY = Map.of(
            "POP", NATURAL,
            "FOLK", SIMPLE,
            "CLASSICAL", SIMPLE,
            "BALLAD", COLORFUL,
            "BOLERO", COLORFUL,
            "JAZZ", JAZZY,
            "BLUES", JAZZY);

    private final String label;

    ChordStyle(String label) {
        this.label = label;
    }

    /** Tên hiện trong tiêu đề đề xuất, ví dụ "Gợi ý hợp âm (Tự nhiên)". */
    public String label() {
        return label;
    }

    /** Đọc không phân biệt hoa thường; null thì mặc định NATURAL; tên phong cách cũ quy về màu; giá trị lạ trả rỗng. */
    public static Optional<ChordStyle> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.of(NATURAL);
        }
        String key = value.strip().toUpperCase(Locale.ROOT);
        if (LEGACY.containsKey(key)) {
            return Optional.of(LEGACY.get(key));
        }
        try {
            return Optional.of(valueOf(key));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
