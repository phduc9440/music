package com.ptit.music_be.dto.enums.admin;

/** Thao tác hàng loạt của admin trên nhiều bản nhạc. */
public enum ScoreBulkAction {
    /** Duyệt các bản đang chờ duyệt (PENDING → PUBLIC); bản ở trạng thái khác báo lỗi trong danh sách thất bại. */
    PUBLIC,
    /** Gỡ bản đang công khai về riêng tư (kèm lý do, rời kho mẫu, báo cho chủ). */
    PRIVATE,
    /** Xóa bản nhạc và file. */
    DELETE
}
