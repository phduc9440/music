package com.ptit.music_be.dto.request.admin;

import com.ptit.music_be.service.billing.PlanLimits;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * SUPER_ADMIN tạo gói mới. {@code code}: chữ in hoa, số và dấu gạch dưới, 2..16 ký tự, không đổi được sau khi tạo.
 * {@code audience}: PERSONAL hoặc TEAM. {@code sortOrder} null thì xếp cuối.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class CreatePlanRequest {
    String code;
    String audience;
    String name;
    Long priceMonth;
    Long priceYear;
    PlanLimits limits;
    Integer sortOrder;
}
