package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Một gói mua/được cấp còn hạn của thành viên. Mỗi người có tối đa một gói cá nhân và một gói team cùng lúc, mỗi gói có
 * hạn và nút gia hạn riêng ở trang "Gói của tôi". {@code banned}: gói đang bị cấm dùng (vẫn còn hạn nhưng không được dùng
 * hay gia hạn tới khi hết cấm).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class HeldSubscription {
    PlanResponse plan;
    /** PAYMENT / POINTS_TRIAL / ADMIN_GRANT. */
    String source;
    LocalDateTime startsAt;
    LocalDateTime expiresAt;
    boolean banned;
}
