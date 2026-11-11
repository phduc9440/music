package com.ptit.music_be.dto.response;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Trang "Mời bạn" (7.5): mã giới thiệu của tôi, số người đã đăng ký bằng mã và số người đã được tính thưởng. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ReferralResponse {
    String code;
    long invitedCount;
    long rewardedCount;
}
