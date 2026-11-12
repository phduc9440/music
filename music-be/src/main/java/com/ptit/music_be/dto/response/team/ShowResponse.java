package com.ptit.music_be.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.ShowStatus;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một show và tiến độ (số bài đã duyệt / tổng số bài). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShowResponse {
    String id;
    String teamId;
    String name;
    LocalDate showDate;
    String venue;
    String notes;
    ShowStatus status;
    long itemCount;
    long approvedCount;
    LocalDateTime createdAt;
}
