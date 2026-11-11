package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Gói đang dùng của một thành viên, hiện ở danh sách thành viên khu quản trị. {@code status}: FREE, ACTIVE (gói mua/được
 * cấp, hoặc ADMIN dùng Pro theo vai trò) hoặc UNLIMITED (SUPER_ADMIN). {@code source}: PAYMENT / ADMIN_GRANT /
 * POINTS_TRIAL / ROLE; null với Free.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MemberPlanSummary {
    String code;
    String name;
    String status;
    String source;
    LocalDateTime expiresAt;
    /** ADMIN đang bị tạm ngưng gói Pro theo vai trò đến lúc này; null = không bị ngưng. */
    LocalDateTime rolePlanSuspendedUntil;
}
