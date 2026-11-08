package com.ptit.music_be.dto.enums;

/** Loại thông báo trong ứng dụng (lưu dạng chuỗi trong {@code notifications.type}). */
public enum NotificationType {
    /** Có người xin quyền xem/chỉnh sửa bản nhạc của bạn. */
    ACCESS_REQUESTED,
    ACCESS_APPROVED,
    ACCESS_REJECTED,
    /** Được chủ bản nhạc mời/chia sẻ trực tiếp. */
    SHARED_WITH_YOU,
    /** Gửi ADMIN: có bản nhạc xin công khai. */
    PUBLISH_REQUESTED,
    PUBLISH_APPROVED,
    PUBLISH_REJECTED,
    /** Có người nhận xét bản nhạc của bạn. */
    NEW_REVIEW
}
