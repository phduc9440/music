package com.ptit.music_be.dto.request.team;

import java.time.LocalDate;

import com.ptit.music_be.dto.enums.team.ShowStatus;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Tạo/sửa show. status null khi tạo = PREPARING; khi sửa = giữ nguyên. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShowRequest {
    String name;
    LocalDate showDate;
    String venue;
    String notes;
    ShowStatus status;
}
