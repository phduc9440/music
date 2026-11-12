package com.ptit.music_be.dto.response.practice;

import java.time.LocalDate;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Thời gian luyện tập trong một chu kỳ (ngày, tuần bắt đầu từ thứ Hai, hoặc tháng). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PracticeTimeBucketResponse {
    /** Ngày đầu chu kỳ. */
    LocalDate start;
    /** Ngày cuối chu kỳ (với DAY thì bằng start). */
    LocalDate end;

    long totalSeconds;
    long sessionCount;
}
