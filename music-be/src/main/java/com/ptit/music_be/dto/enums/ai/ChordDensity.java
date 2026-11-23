package com.ptit.music_be.dto.enums.ai;

import java.util.Locale;
import java.util.Optional;

/** Mật độ đổi hợp âm (R3): thưa (phách mạnh), vừa (đầu phách), dày (thêm chỗ nốt móc đơn). */
public enum ChordDensity {
    SPARSE,
    NORMAL,
    DENSE;

    /** Đọc không phân biệt hoa thường; null thì mặc định NORMAL, giá trị lạ trả rỗng. */
    public static Optional<ChordDensity> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.of(NORMAL);
        }
        try {
            return Optional.of(valueOf(value.strip().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
