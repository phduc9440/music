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
    NEW_REVIEW,
    /** Thông báo chung do ADMIN gửi cho một nhóm người dùng. */
    ANNOUNCEMENT,
    /** ADMIN đã chuyển bản nhạc của bạn vào thùng rác (kèm lý do nếu có). */
    SCORE_TRASHED_BY_ADMIN,
    /** Gửi chủ bản nhạc: quản trị viên xin đưa bản nhạc vào kho bản nhạc mẫu, chờ đồng ý. */
    OFFICIAL_REQUESTED,
    /** Gửi quản trị viên: chủ đã đồng ý, bản sao đã vào kho mẫu. */
    OFFICIAL_ACCEPTED,
    /** Gửi quản trị viên: chủ đã từ chối. */
    OFFICIAL_DECLINED,
    /** Thanh toán gói thành công, gói đã được kích hoạt. */
    PLAN_ACTIVATED
}
