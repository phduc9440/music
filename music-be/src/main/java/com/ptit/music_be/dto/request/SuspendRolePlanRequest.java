package com.ptit.music_be.dto.request;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * SUPER_ADMIN tạm ngưng gói Pro theo vai trò của một ADMIN. {@code months}: 0 = đến hết tháng này, 1..120 = số tháng tính
 * theo lịch từ hôm nay. {@code reason} tùy chọn, tối đa 255 ký tự.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SuspendRolePlanRequest {
    Integer months;
    String reason;
}
