package com.ptit.music_be.service.notification;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.notification.NotificationResponse;
import com.ptit.music_be.entity.Member;

/** Thông báo trong ứng dụng (chuông). Các service nghiệp vụ gọi {@code notify*} cùng transaction với thao tác gốc. */
public interface NotificationService {

    /** Gửi cho một người. Người nhận null hoặc chính người gây ra sự kiện thì bỏ qua. */
    default void notify(Member recipient, Member actor, NotificationType type, String scoreId, String message) {
        notify(recipient, actor, type, scoreId, message, null);
    }

    /**
     * Như trên, kèm {@code params} (title, name, level, reason...): web dựng câu theo ngôn ngữ của người đọc từ loại thông
     * báo và params, còn {@code message} (tiếng Việt) là bản dự phòng.
     */
    void notify(
            Member recipient,
            Member actor,
            NotificationType type,
            String scoreId,
            String message,
            java.util.Map<String, String> params);

    /** Tên bài trong thông báo dài hơn mức này thì cắt kèm "…" (T38): chuông và toast không bị một chuỗi dài chiếm hết. */
    int MAX_TITLE_IN_NOTIFICATION = 60;

    /** Dựng params từ các cặp khóa, giá trị; bỏ cặp có giá trị null; tham số "title" dài thì cắt ngắn. */
    static java.util.Map<String, String> params(String... keyValues) {
        java.util.Map<String, String> map = new java.util.LinkedHashMap<>();
        for (int i = 0; i + 1 < keyValues.length; i += 2) {
            String value = keyValues[i + 1];
            if (value == null) {
                continue;
            }
            if ("title".equals(keyValues[i]) && value.length() > MAX_TITLE_IN_NOTIFICATION) {
                value = value.substring(0, MAX_TITLE_IN_NOTIFICATION - 1) + "…";
            }
            map.put(keyValues[i], value);
        }
        return map;
    }

    /** Gửi cho mọi ADMIN (trừ người gây ra sự kiện). */
    default void notifyAdmins(Member actor, NotificationType type, String scoreId, String message) {
        notifyAdmins(actor, type, scoreId, message, null);
    }

    /** Như trên, kèm params để web dựng câu theo ngôn ngữ. */
    void notifyAdmins(
            Member actor, NotificationType type, String scoreId, String message, java.util.Map<String, String> params);

    /** Gửi cùng một nội dung cho nhiều người (bỏ qua người gây ra sự kiện); trả về số người đã nhận. */
    int notifyAll(java.util.Collection<Member> recipients, Member actor, NotificationType type, String message);

    PageResponse<NotificationResponse> getMine(int page, int size);

    long countUnread();

    void markRead(String notificationId);

    void markAllRead();
}
