package com.ptit.music_be.dto.response;

import java.time.LocalDate;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một ngày có luyện tập trên heatmap. Ngày không có tập thì không xuất hiện. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PracticeHeatmapDayResponse {
    LocalDate date;
    long sessionCount;
    long totalSeconds;
}
