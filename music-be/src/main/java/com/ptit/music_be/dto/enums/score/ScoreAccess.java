package com.ptit.music_be.dto.enums;

/**
 * Mức truy cập của một người với một bản nhạc, tính ra bởi {@code ScorePermissionService}. Cấp bậc từ thấp lên cao,
 * cấp trên gồm cả cấp dưới: NONE &lt; VIEW &lt; REVIEW &lt; EDIT &lt; OWNER.
 */
public enum ScoreAccess {
    NONE,
    VIEW,
    REVIEW,
    EDIT,
    OWNER;

    /** Mức này có bao gồm mức {@code other} không (EDIT gồm REVIEW gồm VIEW). */
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
            case REVIEW -> REVIEW;
            case EDIT -> EDIT;
        };
    }

    /** Mức cao hơn trong hai mức. */
    public static ScoreAccess max(ScoreAccess a, ScoreAccess b) {
        return a.includes(b) ? a : b;
    }
}
