package com.ptit.music_be.dto.enums;

/** Trạng thái lời xin đưa một bản nhạc vào kho bản nhạc mẫu. */
public enum OfficialRequestStatus {
    /** Đang chờ chủ sở hữu trả lời. */
    PENDING,
    /** Chủ đồng ý: bản sao đã nằm trong kho mẫu. */
    ACCEPTED,
    /** Chủ từ chối. */
    DECLINED,
    /** Quản trị viên rút lại. */
    CANCELED
}
