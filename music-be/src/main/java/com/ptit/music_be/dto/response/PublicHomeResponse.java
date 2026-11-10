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

    /**
     * Số bản đầu danh sách featured được chọn vì có lượt xem trong 7 ngày qua ("Nổi bật tuần"); các bản sau được bổ sung
     * theo tổng lượt xem. 0 nghĩa là chưa có lượt xem nào trong tuần.
     */
    int featuredWeekly;

    /** Nhạc sĩ có nhiều bản công khai nhất (bảng composers, mục 5.4), kèm tối đa 3 bản tiêu biểu. */
    List<ComposerResponse> composers;

    Stats stats;

    /** Thời điểm tính số liệu (kết quả được nhớ 5 phút). */
    LocalDateTime generatedAt;

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
