package com.ptit.music_be.dto.enums;

import java.util.Arrays;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Trạng thái tài khoản. Trong DB lưu dạng số: 1 = ACTIVE, 2 = INACTIVE. API cũng trả/nhận dạng số. */
public enum MemberStatus {
    ACTIVE(1),
    INACTIVE(2);

    private final int code;

    MemberStatus(int code) {
        this.code = code;
    }

    @JsonValue
    public int getCode() {
        return code;
    }

    @JsonCreator
    public static MemberStatus fromCode(int code) {
        return Arrays.stream(values())
                .filter(s -> s.code == code)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown member status code: " + code));
    }
}
