package com.ptit.music_be.dto.response;

import java.time.LocalDate;
import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Số liệu tổng quan cho trang dashboard của admin. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminDashboardResponse {

    /** Số ngày của các biểu đồ theo ngày. */
    int days;

    Totals totals;
    /** Bản nhạc tạo mới mỗi ngày (đủ days ngày, ngày không có là 0). */
    List<DayCount> scoresByDay;
    /** Luyện tập mỗi ngày: số phiên và số phút. */
    List<DayPractice> practiceByDay;
    List<KeyCount> scoresByVisibility;
    List<KeyCount> scoresBySource;
    List<KeyCount> scoresByDifficulty;
    List<KeyCount> aiTasksByStatus;
    List<KeyCount> topTags;
    List<TopScore> topViewed;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Totals {
        long members;
        long activeMembers;
        long lockedMembers;
        long admins;
        long scores;
        long publicScores;
        long pendingScores;
        long officialScores;
        long reviews;
        /** Điểm sao trung bình toàn hệ thống; null nếu chưa có nhận xét. */
        Double averageRating;
        long practiceSessions;
        long aiTasksRunning;
        long aiTasksFailed;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class DayCount {
        LocalDate date;
        long count;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class DayPractice {
        LocalDate date;
        long sessions;
        double minutes;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class KeyCount {
        String key;
        long count;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class TopScore {
        String id;
        String title;
        String ownerEmail;
        long viewCount;
    }
}
