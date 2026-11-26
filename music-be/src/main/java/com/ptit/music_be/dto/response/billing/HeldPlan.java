package com.ptit.music_be.dto.response.billing;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Một gói thành viên đang có (chưa tính lệnh cấm): gói mua/được cấp còn hạn, hoặc Pro theo vai trò của ADMIN. Dùng để chọn
 * gói khi cấm người có hai gói. {@code source}: PAYMENT / ADMIN_GRANT / POINTS_TRIAL / ROLE.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class HeldPlan {
    String code;
    String name;
    String source;
    LocalDateTime expiresAt;
}
