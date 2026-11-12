package com.ptit.music_be.dto.request.admin;

import java.util.List;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** SUPER_ADMIN cấp một gói cá nhân cho nhiều thành viên cùng lúc (tối đa 200 người), {@code months} tháng (1..120). */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class BulkGrantPlanRequest {
    String planCode;
    Integer months;
    List<String> memberIds;
}
