package com.ptit.music_be.dto.enums.admin;

/** Nhóm nhận thông báo chung của admin (chỉ tính tài khoản đang hoạt động). */
public enum AnnouncementAudience {
    /** Mọi người dùng, kể cả admin. */
    ALL,
    /** Chỉ người dùng thường (không phải ADMIN/SUPER_ADMIN). */
    USERS,
    /** Chỉ ADMIN và SUPER_ADMIN. */
    ADMINS,
    /** Đúng những tài khoản admin chọn (memberIds). */
    SELECTED
}
