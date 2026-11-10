package com.ptit.music_be.dto.enums;

/** Thao tác hàng loạt của admin trên nhiều bản nhạc. */
public enum ScoreBulkAction {
    /** Đặt công khai ngay. */
    PUBLIC,
    /** Gỡ về riêng tư (kèm lý do, rời kho mẫu, báo cho chủ). */
    PRIVATE,
    /** Xóa bản nhạc và file. */
    DELETE
}
