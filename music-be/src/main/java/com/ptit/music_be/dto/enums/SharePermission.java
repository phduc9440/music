package com.ptit.music_be.dto.enums;

import java.util.Arrays;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Quyền của người được chia sẻ bản nhạc (MemberScore.permission). DB lưu số: 1 = VIEW, 2 = EDIT. API cũng trả/nhận dạng số. */
public enum SharePermission {
    VIEW(1),
    EDIT(2);

    private final int code;

    SharePermission(int code) {
        this.code = code;
    }

    @JsonValue
    public int getCode() {
        return code;
    }

    @JsonCreator
    public static SharePermission fromCode(int code) {
        return Arrays.stream(values())
                .filter(v -> v.code == code)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown SharePermission code: " + code));
    }
}
