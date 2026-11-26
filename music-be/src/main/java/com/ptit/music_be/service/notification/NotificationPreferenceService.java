package com.ptit.music_be.service.notification;

import java.util.List;
import java.util.Set;

import com.ptit.music_be.dto.enums.notification.NotificationCategory;
import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.request.notification.NotificationPreferenceRequest;
import com.ptit.music_be.dto.response.notification.NotificationPreferenceResponse;

/** Cài đặt nhận thông báo theo nhóm của người dùng (mục R8): trong ứng dụng, email tóm tắt hằng ngày, hoặc tắt. */
public interface NotificationPreferenceService {

    /** Một người nhận thông báo loại này theo cách nào. */
    record Delivery(boolean inApp, boolean email) {
        public static final Delivery DEFAULT = new Delivery(true, false);

        /** Cả hai đều tắt: bỏ qua, không tạo thông báo. */
        public boolean none() {
            return !inApp && !email;
        }
    }

    /** Cài đặt của người đang đăng nhập, đủ mọi nhóm chỉnh được (nhóm chưa chỉnh lấy mặc định). */
    List<NotificationPreferenceResponse> getMine();

    List<NotificationPreferenceResponse> updateMine(NotificationPreferenceRequest request);

    /** Cách {@code memberId} nhận thông báo {@code type}; nhóm hệ thống luôn hiện trong ứng dụng. */
    Delivery deliveryFor(String memberId, NotificationType type);

    /** Các loại thông báo bị tắt hiển thị trong ứng dụng của người này (để ẩn khỏi chuông). */
    Set<NotificationType> hiddenInAppTypes(String email);

    /** Dùng khi dựng email: các nhóm người này bật email. */
    Set<NotificationCategory> emailCategories(String memberId);
}
