package com.ptit.music_be.dto.enums.auth;

import java.util.Arrays;
import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Trạng thái tài khoản. Trong DB lưu dạng số: 1 = ACTIVE, 2 = INACTIVE. API trả dạng số, nhận cả số lẫn tên (ACTIVE,
 * INACTIVE, LOCKED = INACTIVE) để client gửi chữ không bị lỗi chung 1009 (A-05).
 */
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

    @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
    public static MemberStatus fromJson(Object value) {
        if (value instanceof Number number) {
            return fromCode(number.intValue());
        }
        String text = String.valueOf(value).trim().toUpperCase(Locale.ROOT);
        if (text.chars().allMatch(Character::isDigit) && !text.isEmpty()) {
            return fromCode(Integer.parseInt(text));
        }
        if ("LOCKED".equals(text)) {
            return INACTIVE;
        }
        return valueOf(text);
    }

    public static MemberStatus fromCode(int code) {
        return Arrays.stream(values())
                .filter(s -> s.code == code)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown member status code: " + code));
    }
}
