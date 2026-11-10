package com.ptit.music_be.repository;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.Score;

/**
 * Các bộ đếm của bản nhạc. Tách khỏi {@link ScoreRepository} để chỉ chứa câu lệnh cập nhật nguyên tử, không đọc rồi ghi
 * lại cả entity (hai người xem cùng lúc không làm mất lượt).
 */
public interface ScoreCounterRepository extends Repository<Score, String> {

    /** Tăng lượt xem thêm 1 trong một câu UPDATE; trả về số dòng bị ảnh hưởng (0 nếu không có bản nhạc). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Score s SET s.viewCount = COALESCE(s.viewCount, 0) + 1 WHERE s.id = :scoreId")
    int incrementViewCount(@Param("scoreId") String scoreId);

    /** Lượt xem hiện tại (0 nếu cột còn null). */
    @Query("SELECT COALESCE(s.viewCount, 0) FROM Score s WHERE s.id = :scoreId")
    Long findViewCount(@Param("scoreId") String scoreId);

    /**
     * Cộng một lượt xem vào dòng đếm của ngày {@code day} (tạo dòng nếu chưa có) bằng một câu lệnh nguyên tử. Dùng cho
     * mục "Nổi bật tuần" ở trang chủ.
     */
    @Modifying
    @Query(
            value = "INSERT INTO score_daily_views (score_id, view_date, views) VALUES (:scoreId, :day, 1)"
                    + " ON DUPLICATE KEY UPDATE views = views + 1",
            nativeQuery = true)
    int incrementDailyViews(@Param("scoreId") String scoreId, @Param("day") java.time.LocalDate day);
}
