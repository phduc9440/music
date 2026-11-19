package com.ptit.music_be.dto.response.admin;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một buổi luyện trong trang quản trị, kèm các dấu hiệu bất thường tính lúc đọc (không lưu). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminPracticeSessionResponse {
    String id;
    String memberId;
    String memberEmail;
    String memberName;
    String scoreId;
    String scoreTitle;
    /** Tên chế độ: FREE, LOOP, TEST, WAIT, FREE_RUN. */
    String mode;
    /** IN_PROGRESS, COMPLETED, ABANDONED. */
    String status;

    LocalDateTime startedAt;
    LocalDateTime endedAt;
    Integer durationSeconds;
    Double tempoPercent;
    Integer totalNotes;
    Double accuracyPct;
    Double scorePoints;
    /** Mã dấu hiệu bất thường: SHORT, LONG, ZERO_ACCURACY, STUCK; rỗng nếu bình thường. */
    List<String> anomalies;
    /** Đóng thủ công được: buổi còn IN_PROGRESS. */
    boolean canClose;

    /** Thống kê toàn hệ thống trong khoảng ngày, tính từ practice_sessions. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Overview {
        LocalDate from;
        LocalDate to;
        long sessions;
        double minutes;
        /** Độ chính xác trung bình (%) của các buổi COMPLETED có dữ liệu; null nếu chưa có. */
        Double averageAccuracy;
        /** Tỷ lệ COMPLETED trong các buổi đã kết thúc (0..1); null nếu chưa có buổi nào kết thúc. */
        Double completionRate;

        long activeMembers;
        long anomalous;
        List<Day> byDay;
    }

    public record Day(LocalDate date, long sessions, double minutes) {}
}
