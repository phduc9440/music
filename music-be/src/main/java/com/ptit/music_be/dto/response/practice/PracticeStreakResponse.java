package com.ptit.music_be.dto.response.practice;

import java.time.LocalDate;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PracticeStreakResponse {
    /** Số ngày liên tiếp tính đến hôm nay (hôm nay chưa tập mà hôm qua có tập thì chuỗi vẫn còn). */
    int currentStreak;
    /** Chuỗi ngày liên tiếp dài nhất từ trước đến nay. */
    int longestStreak;
    /** Ngày tập gần nhất, null nếu chưa tập lần nào. */
    LocalDate lastPracticeDate;

    boolean practicedToday;
}
