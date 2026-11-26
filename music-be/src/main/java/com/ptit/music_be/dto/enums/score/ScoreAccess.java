package com.ptit.music_be.dto.enums.score;

/**
 * Mức truy cập của một người với một bản nhạc, tính ra bởi {@code ScorePermissionService}. Cấp bậc từ thấp lên cao,
 * cấp trên gồm cả cấp dưới: NONE &lt; VIEW &lt; COMMENT &lt; EDIT &lt; OWNER. VIEW gồm cả nhận xét / chấm sao cả bản nhạc; góp ý trên ô nhịp và
 * đề xuất sửa cần COMMENT (chủ chia sẻ hoặc team cấp, bản công khai chỉ cho VIEW).
 */
public enum ScoreAccess {
    NONE,
    VIEW,
    COMMENT,
    EDIT,
    OWNER;

    /** Mức này có bao gồm mức {@code other} không (EDIT gồm COMMENT gồm VIEW). */
    public boolean includes(ScoreAccess other) {
        return compareTo(other) >= 0;
    }

    /** Quyền được chia sẻ tương ứng với mức truy cập; null tức là chưa được cấp gì. */
    public static ScoreAccess of(SharePermission permission) {
        if (permission == null) {
            return NONE;
        }
        return switch (permission) {
            case VIEW -> VIEW;
            case COMMENT -> COMMENT;
            case EDIT -> EDIT;
        };
    }

    /** Mức cao hơn trong hai mức. */
    public static ScoreAccess max(ScoreAccess a, ScoreAccess b) {
        return a.includes(b) ? a : b;
    }
}
