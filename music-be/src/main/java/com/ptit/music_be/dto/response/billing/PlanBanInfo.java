package com.ptit.music_be.dto.response.billing;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một lệnh cấm đang hiệu lực: gói bị cấm dùng và thời điểm hết cấm. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlanBanInfo {
    String planCode;
    String planName;
    LocalDateTime until;
}
