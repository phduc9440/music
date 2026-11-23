package com.ptit.music_be.dto.enums.ai;

import java.util.Locale;
import java.util.Optional;

/** Độ sáng tạo khi music-ai lấy mẫu hợp âm (R3): an toàn (hợp âm hay gặp) → táo bạo (lạ tai hơn). */
public enum ChordCreativity {
    SAFE,
    BALANCED,
    BOLD;

    /** Đọc không phân biệt hoa thường; null thì mặc định BALANCED, giá trị lạ trả rỗng. */
    public static Optional<ChordCreativity> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.of(BALANCED);
        }
        try {
            return Optional.of(valueOf(value.strip().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
