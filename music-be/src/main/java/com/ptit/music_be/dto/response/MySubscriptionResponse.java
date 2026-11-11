package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Gói hiện tại của người đang đăng nhập kèm số đã dùng trong tháng (trang "Gói của tôi"). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MySubscriptionResponse {
    PlanResponse plan;
    /**
     * ACTIVE (đang có gói trả phí/được cấp, hoặc ADMIN dùng Pro theo vai trò), FREE (không có dòng nào còn hiệu lực) hoặc
     * UNLIMITED (SUPER_ADMIN: không giới hạn, không cần mua gói).
     */
    String status;
    /** PAYMENT / POINTS_TRIAL / ADMIN_GRANT / ROLE (quyền lợi theo vai trò quản trị); null khi ở gói Free mặc định. */
    String source;
    /** SUPER_ADMIN hoặc ADMIN nếu quyền lợi đến từ vai trò; null với người dùng thường. */
    String roleGrant;
    /** ADMIN đang bị tạm ngưng gói Pro theo vai trò đến lúc này; null = không bị ngưng. */
    java.time.LocalDateTime rolePlanSuspendedUntil;
    LocalDateTime startsAt;
    LocalDateTime expiresAt;
    /** Trang OMR đã dùng trong tháng hiện tại. */
    int omrPagesUsed;
}
