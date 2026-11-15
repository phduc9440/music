package com.ptit.music_be.dto.enums.report;

/** Cách admin xử lý một báo cáo. Hợp lệ theo từng loại đối tượng: xem {@link #allowedFor}. */
public enum ReportAction {
    /** Bỏ qua: báo cáo không đúng. */
    DISMISS,
    /** Gỡ công khai bản nhạc (về riêng tư, rời kho mẫu). */
    UNPUBLISH,
    /** Ẩn góp ý. */
    HIDE,
    /** Xóa mềm bản nhạc (vào thùng rác của chủ). */
    SOFT_DELETE,
    /** Khóa tài khoản của người sở hữu / người viết. */
    LOCK_ACCOUNT;

    public boolean allowedFor(ReportTargetType type) {
        return switch (this) {
            case DISMISS, LOCK_ACCOUNT -> true;
            case UNPUBLISH, SOFT_DELETE -> type == ReportTargetType.SCORE;
            case HIDE -> type == ReportTargetType.COMMENT;
        };
    }
}
