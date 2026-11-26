package com.ptit.music_be.dto.request.team;

import java.time.LocalDate;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Thêm bài vào show (scoreId bắt buộc) hoặc sửa phân công: người phối, người duyệt, hạn, ghi chú (null = bỏ trống). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShowItemRequest {
    String scoreId;
    String arrangerId;
    String reviewerId;
    LocalDate dueDate;
    String notes;
}
