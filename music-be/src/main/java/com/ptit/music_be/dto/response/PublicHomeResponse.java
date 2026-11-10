package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Dữ liệu trang chủ cho khách (GET /api/public/home). Không chứa email hay dữ liệu riêng tư nào. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PublicHomeResponse {

    /**
     * Bản nhạc công khai nổi bật (xem nhiều nhất). thumbnailUrl trỏ tới ảnh công khai
     * /api/public/scores/{id}/thumbnail, khách tải được không cần đăng nhập.
     */
    List<ScoreSummaryResponse> featured;

    /** Tác giả có nhiều bản công khai nhất (gom theo tên, chưa có bảng nhạc sĩ). */
    List<Composer> composers;

    Stats stats;

    /** Thời điểm tính số liệu (kết quả được nhớ 5 phút). */
    LocalDateTime generatedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Composer {
        String name;
        long scoreCount;
        /** Tối đa 3 tên bản công khai, xem nhiều nhất trước. */
        List<String> topTitles;
    }

    /** Số liệu thật đếm từ DB. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Stats {
        long scores;
        long publicScores;
        /** Tổng số trang bản gốc đã số hóa xong bằng OMR. */
        long digitizedPages;
        /** Tổng giờ luyện tập, làm tròn xuống. */
        long practiceHours;

        long members;
    }
}
