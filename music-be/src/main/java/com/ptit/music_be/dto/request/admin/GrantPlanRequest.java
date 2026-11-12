package com.ptit.music_be.dto.request.admin;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class GrantPlanRequest {
    String memberId;
    String planCode;
    /** Số tháng (1..120), tính theo lịch từ ngày bắt đầu: hôm nay, hoặc ngày hết hạn hiện tại nếu gia hạn cùng gói. */
    Integer months;
}
