package com.ptit.music_be.service;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.response.NotificationResponse;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.entity.Member;

/** Thông báo trong ứng dụng (chuông). Các service nghiệp vụ gọi {@code notify*} cùng transaction với thao tác gốc. */
public interface NotificationService {

    /** Gửi cho một người. Người nhận null hoặc chính người gây ra sự kiện thì bỏ qua. */
    void notify(Member recipient, Member actor, NotificationType type, String scoreId, String message);

    /** Gửi cho mọi ADMIN (trừ người gây ra sự kiện). */
    void notifyAdmins(Member actor, NotificationType type, String scoreId, String message);

    PageResponse<NotificationResponse> getMine(int page, int size);

    long countUnread();

    void markRead(String notificationId);

    void markAllRead();
}
