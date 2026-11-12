package com.ptit.music_be.dto.enums.team;

/** Trạng thái lời mời vào team. Hết hạn không lưu thành trạng thái riêng mà suy ra từ {@code expires_at}. */
public enum TeamInvitationStatus {
    PENDING,
    ACCEPTED,
    /** Người được mời từ chối. */
    DECLINED,
    /** Quản lý team thu hồi. */
    REVOKED
}
