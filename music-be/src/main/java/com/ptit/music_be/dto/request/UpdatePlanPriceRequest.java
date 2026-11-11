package com.ptit.music_be.dto.request;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** SUPER_ADMIN đổi giá một gói (VND, số nguyên). */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UpdatePlanPriceRequest {
    Long priceMonth;
    Long priceYear;
}
