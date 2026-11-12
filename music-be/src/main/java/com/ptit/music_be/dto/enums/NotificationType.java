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
    PLAN_ACTIVATED,
    /** Nhắc gói sắp hết hạn (còn 7 ngày và còn 1 ngày). */
    PLAN_EXPIRING,
    /** Gói đang dùng bị thu hồi do vi phạm (kèm lý do). */
    PLAN_REVOKED,
    /** Bị cấm dùng gói trả phí đến một ngày (kèm lý do). */
    PLAN_BANNED,
    /** Được gỡ lệnh cấm dùng gói trả phí sớm. */
    PLAN_BAN_LIFTED,
    // ---- Team và Show (mục 4.1); params có teamId (và showId với thông báo về bài trong show) để web mở đúng trang
    /** Được mời vào team (lời mời theo email của tài khoản đã có). */
    TEAM_INVITED,
    /** Gửi người mời: có người đã chấp nhận lời mời. */
    TEAM_MEMBER_JOINED,
    /** Vai trò của bạn trong team đã đổi. */
    TEAM_ROLE_CHANGED,
    /** Bạn bị xóa khỏi team. */
    TEAM_REMOVED,
    /** Được giao phối (variant arranger) hoặc duyệt (variant reviewer) một bài trong show. */
    SHOW_ITEM_ASSIGNED,
    /** Gửi người duyệt: người phối đã gửi duyệt. */
    SHOW_ITEM_SUBMITTED,
    /** Gửi người phối: bài đã được duyệt. */
    SHOW_ITEM_APPROVED,
    /** Gửi người phối: bài bị trả lại kèm góp ý. */
    SHOW_ITEM_RETURNED,
    /** Nhắc hạn: còn 2 ngày (variant soon) hoặc hôm nay là hạn (variant today). */
    SHOW_ITEM_DUE
}
