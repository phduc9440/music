package com.ptit.music_be.dto.enums;

import java.util.Arrays;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Chế độ luyện tập lưu trong PracticeSession.mode. Các mã FREE/LOOP/TEST được giữ nguyên cho dữ liệu cũ; WAIT và
 * FREE_RUN dùng cho Studio.
 */
public enum PracticeMode {
    /** Luyện tự do, chơi hết bài. */
    FREE(1),
    /** Lặp lại một đoạn (loopStartMeasure - loopEndMeasure). */
    LOOP(2),
    /** Chơi chấm điểm. */
    TEST(3),
    /** Chờ người tập chơi đúng nốt/nhóm nốt. */
    WAIT(4),
    /** Chạy theo nhạc và chấm độ chính xác. */
    FREE_RUN(5);

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
