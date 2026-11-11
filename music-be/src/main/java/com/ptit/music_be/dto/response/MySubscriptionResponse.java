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
    /** Các gói đang có (chưa tính lệnh cấm): gói mua/được cấp còn hạn và Pro theo vai trò của ADMIN. */
    @Builder.Default
    java.util.List<HeldPlan> heldPlans = new java.util.ArrayList<>();

    /** Các gói đang bị cấm dùng (kèm hạn); rỗng = không bị cấm gói nào. */
    @Builder.Default
    java.util.List<PlanBanInfo> bans = new java.util.ArrayList<>();
    LocalDateTime startsAt;
    LocalDateTime expiresAt;
    /** Trang OMR đã dùng trong tháng hiện tại. */
    int omrPagesUsed;
}
