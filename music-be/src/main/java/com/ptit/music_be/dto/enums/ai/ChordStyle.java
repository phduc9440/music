package com.ptit.music_be.dto.enums.ai;

import java.util.Locale;
import java.util.Optional;

/** Phong cách gợi ý hợp âm (R3), mỗi phong cách là một bảng xác suất HMM riêng ở music-ai. */
public enum ChordStyle {
    POP("Pop"),
    BALLAD("Ballad"),
    JAZZ("Jazz");

    private final String label;

    ChordStyle(String label) {
        this.label = label;
    }

    /** Tên hiện trong tiêu đề đề xuất, ví dụ "Gợi ý hợp âm (Pop)". */
    public String label() {
        return label;
    }

    /** Đọc không phân biệt hoa thường; null hoặc giá trị lạ trả rỗng. */
    public static Optional<ChordStyle> parse(String value) {
        if (value == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(valueOf(value.strip().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
