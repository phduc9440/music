package com.ptit.music_be.dto.enums;

import java.util.Arrays;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Nguồn đăng nhập. Trong DB lưu dạng số: 1 = LOCAL, 2 = GOOGLE. API cũng trả/nhận dạng số. */
public enum AuthProvider {
    LOCAL(1),
    GOOGLE(2);

    private final int code;

    AuthProvider(int code) {
        this.code = code;
    }

    @JsonValue
    public int getCode() {
        return code;
    }

    @JsonCreator
    public static AuthProvider fromCode(int code) {
        return Arrays.stream(values())
                .filter(p -> p.code == code)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown auth provider code: " + code));
    }
}
