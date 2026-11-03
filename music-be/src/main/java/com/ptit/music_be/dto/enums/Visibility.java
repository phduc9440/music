package com.ptit.music_be.dto.enums;

/** Giá trị lưu trong {@code Score.visibility}. */
public enum Visibility {
    /** Chỉ chủ sở hữu (và người được chia sẻ, ADMIN) xem được. */
    PRIVATE,
    /** Ai đăng nhập cũng xem được. */
    PUBLIC
}
