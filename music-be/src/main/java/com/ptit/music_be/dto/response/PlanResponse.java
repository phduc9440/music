package com.ptit.music_be.dto.response;

import com.ptit.music_be.service.billing.PlanLimits;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlanResponse {
    String code;
    String name;
    /** PERSONAL (cá nhân) hoặc TEAM (nhóm); UNLIMITED chỉ có ở gói ảo của SUPER_ADMIN. */
    String audience;
    long priceMonth;
    long priceYear;
    PlanLimits limits;
}
