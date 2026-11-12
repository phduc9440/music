package com.ptit.music_be.dto.enums;

/** Giá trị lưu trong {@code Score.visibility}. */
public enum Visibility {
    /** Chỉ chủ sở hữu (và người được chia sẻ, ADMIN) xem được. */
    PRIVATE,
    /** Chủ đã xin công khai, đang chờ ADMIN duyệt; trong lúc chờ vẫn như PRIVATE. */
    PENDING,
    /** Đã được ADMIN duyệt: ai đăng nhập cũng xem và nhận xét được. */
    PUBLIC
}
