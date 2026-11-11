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
    long priceMonth;
    long priceYear;
    PlanLimits limits;
}
