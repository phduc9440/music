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
    /** ACTIVE (đang có gói trả phí/được cấp) hoặc FREE (không có dòng nào còn hiệu lực). */
    String status;
    /** PAYMENT / POINTS_TRIAL / ADMIN_GRANT; null khi ở gói Free mặc định. */
    String source;
    LocalDateTime startsAt;
    LocalDateTime expiresAt;
    /** Trang OMR đã dùng trong tháng hiện tại. */
    int omrPagesUsed;
}
