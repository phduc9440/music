package com.ptit.music_be.dto.request;

import java.util.List;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * SUPER_ADMIN xử lý vi phạm cho một hoặc nhiều thành viên (tối đa 200). {@code months}: số tháng cấm (1..120), chỉ dùng khi
 * cấm. {@code planCode}: gói bị cấm (null = gói đang dùng của từng người). {@code reason}: lý do, tối đa 255 ký tự (gửi kèm thông báo cho người bị xử lý).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlanSanctionRequest {
    List<String> memberIds;
    Integer months;
    String reason;
    /** Cấm: mã gói bị cấm; null = gói đang dùng của từng người. */
    String planCode;
}
