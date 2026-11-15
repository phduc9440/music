package com.ptit.music_be.dto.enums.practice;

import java.util.Arrays;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Chế độ luyện tập (PracticeSession.mode). DB lưu số: 1 = FREE, 2 = LOOP, 3 = TEST. API cũng trả/nhận dạng số. */
public enum PracticeMode {
    /** Luyện tự do, chơi hết bài. */
    FREE(1),
    /** Lặp lại một đoạn (loopStartMeasure - loopEndMeasure). */
    LOOP(2),
    /** Chơi chấm điểm. */
    TEST(3);

    private final int code;

    PracticeMode(int code) {
        this.code = code;
    }

    @JsonValue
    public int getCode() {
        return code;
    }

    @JsonCreator
    public static PracticeMode fromCode(int code) {
        return Arrays.stream(values())
                .filter(v -> v.code == code)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown PracticeMode code: " + code));
    }
}
