package com.ptit.music_be.dto.request;

import com.ptit.music_be.service.billing.PlanLimits;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * SUPER_ADMIN sửa một gói: tên, giá tháng/năm (VND, số nguyên) và hạn mức. Trong {@code limits}, số null = không giới
 * hạn; cờ null coi như không có quyền lợi đó.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UpdatePlanRequest {
    String name;
    Long priceMonth;
    Long priceYear;
    PlanLimits limits;
    /** Thứ tự hiển thị (nhỏ đứng trước); null thì giữ nguyên. */
    Integer sortOrder;
}
