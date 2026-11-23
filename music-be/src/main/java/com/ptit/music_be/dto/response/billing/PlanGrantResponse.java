package com.ptit.music_be.dto.response.billing;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một lần SUPER_ADMIN cấp gói thủ công (lịch sử cấp gói). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlanGrantResponse {
    String id;
    String memberId;
    String memberEmail;
    String memberName;
    String planCode;
    String planName;
    int months;
    /** NEW (cấp mới / đổi gói) hoặc RENEW (gia hạn nối tiếp). */
    String kind;
    /** Người cấp; null nếu tài khoản đó đã bị xóa. */
    String grantedByEmail;

    String grantedByName;
    LocalDateTime startsAt;
    /** Hạn của gói ngay sau lần cấp. */
    LocalDateTime expiresAt;

    LocalDateTime createdAt;
}
