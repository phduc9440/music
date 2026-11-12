package com.ptit.music_be.dto.request.team;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Tạo/sửa team: tên bắt buộc (tối đa 100 ký tự), mô tả tối đa 1000. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamRequest {
    String name;
    String description;
}
