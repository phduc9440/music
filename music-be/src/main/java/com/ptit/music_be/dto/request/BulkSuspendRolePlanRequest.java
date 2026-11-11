package com.ptit.music_be.dto.request;

import java.util.List;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * SUPER_ADMIN tạm ngưng (hoặc mở lại) gói Pro theo vai trò của nhiều ADMIN cùng lúc, tối đa 200 người. {@code months}: 0 =
 * đến hết tháng này, 1..120 tháng (bỏ qua khi mở lại). {@code reason} tùy chọn.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class BulkSuspendRolePlanRequest {
    List<String> memberIds;
    Integer months;
    String reason;
}
