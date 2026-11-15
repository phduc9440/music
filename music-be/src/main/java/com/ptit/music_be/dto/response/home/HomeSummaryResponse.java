package com.ptit.music_be.dto.response.home;

import java.time.LocalDateTime;
import java.util.List;

import com.ptit.music_be.dto.response.practice.PracticeStreakResponse;
import com.ptit.music_be.dto.response.score.ScoreSummaryResponse;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Trang làm việc của người đã đăng nhập (GET /api/home/summary), gộp trong một lần gọi. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class HomeSummaryResponse {

    /** Tên hiển thị (họ tên, nếu chưa có thì email). */
    String displayName;

    PracticeStreakResponse streak;

    /** Số giây đã luyện tập từ 0 giờ hôm nay (giờ server). */
    long todayPracticeSeconds;

    /** 3 bản của tôi cập nhật gần nhất. Khối "Tiếp tục" (Nghĩa) sẽ thay bằng bản mở gần nhất. */
    List<ScoreSummaryResponse> recentScores;

    /** Việc đang chờ tôi xử lý, mới nhất trước (tối đa 5). */
    List<PendingItem> pending;

    /** Tổng số yêu cầu xin quyền đang chờ trên các bản của tôi. */
    long accessRequestCount;
    /** Tổng số lời xin đưa bản của tôi vào kho mẫu đang chờ. */
    long officialRequestCount;
    /** Số bản của tôi đang chờ quản trị viên duyệt công khai (chờ người khác, không phải việc của tôi). */
    long pendingPublicCount;

    /** Gợi ý luyện tập hôm nay; null khi không có gì để gợi ý. */
    Suggestion suggestion;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class PendingItem {
        /** ACCESS_REQUEST (xin quyền xem/nhận xét/sửa) hoặc OFFICIAL_REQUEST (xin đưa vào kho mẫu). */
        String type;

        String scoreId;
        String scoreTitle;
        /** Người xin (họ tên, nếu chưa có thì email; chỉ chủ bản nhạc thấy). */
        String actorName;
        /** Với ACCESS_REQUEST: cấp xin (VIEW / REVIEW / EDIT). */
        String permission;

        LocalDateTime createdAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Suggestion {
        /** CONTINUE: tập tiếp bản tập gần nhất; OFFICIAL: bài dễ nhất trong kho mẫu cho người chưa tập. */
        String reason;

        ScoreSummaryResponse score;
    }
}
