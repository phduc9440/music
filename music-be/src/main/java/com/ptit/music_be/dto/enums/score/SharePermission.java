package com.ptit.music_be.dto.enums.score;

import java.util.Arrays;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Quyền của người được chia sẻ bản nhạc (MemberScore.permission, Score.linkPermission). Cấp bậc từ thấp lên cao, cấp
 * trên gồm cả cấp dưới: VIEW (người xem) &lt; REVIEW (người nhận xét) &lt; EDIT (người chỉnh sửa). DB lưu số: 1 = VIEW,
 * 2 = REVIEW, 3 = EDIT. API cũng trả/nhận dạng số.
 */
public enum SharePermission {
    VIEW(1),
    REVIEW(2),
    EDIT(3);

    private final int code;

    SharePermission(int code) {
        this.code = code;
    }

    /** Quyền này có bao gồm quyền {@code other} không (EDIT gồm REVIEW gồm VIEW). */
    public boolean includes(SharePermission other) {
        return code >= other.code;
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
