package com.ptit.music_be.dto.enums.ai;

import java.util.Locale;
import java.util.Optional;

/** Phong cách gợi ý hợp âm (R3): music-ai tăng / giảm xác suất các nhóm hợp âm của model AutoHarmonizer theo phong cách. */
public enum ChordStyle {
    POP("Pop"),
    BALLAD("Ballad"),
    JAZZ("Jazz"),
    CLASSICAL("Cổ điển"),
    FOLK("Dân ca"),
    BOLERO("Bolero"),
    BLUES("Blues");

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
