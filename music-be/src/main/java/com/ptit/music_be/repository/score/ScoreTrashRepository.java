package com.ptit.music_be.repository.score;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.Score;

/**
 * Truy cập bản nhạc trong thùng rác. {@code Score} có {@code @SQLRestriction("deleted_at IS NULL")} nên mọi truy vấn
 * JPA/HQL đều không thấy bản đã xóa; ở đây dùng native query để vượt qua điều kiện đó. Chỉ khai báo đúng các hàm cần.
 */
public interface ScoreTrashRepository extends Repository<Score, String> {

    /** Thùng rác của một thành viên, bản vừa xóa nằm trên cùng. Truyền Pageable không kèm sort. */
    @Query(
            value = "select * from scores where member_id = :memberId and deleted_at is not null"
                    + " order by deleted_at desc, id",
            countQuery = "select count(*) from scores where member_id = :memberId and deleted_at is not null",
            nativeQuery = true)
    Page<Score> findTrashOfMember(@Param("memberId") String memberId, Pageable pageable);

    @Query(
            value = "select * from scores where id = :id and member_id = :memberId and deleted_at is not null",
            nativeQuery = true)
    Optional<Score> findTrashedByIdAndMember(@Param("id") String id, @Param("memberId") String memberId);

    @Query(value = "select * from scores where id = :id and deleted_at is not null", nativeQuery = true)
    Optional<Score> findTrashedById(@Param("id") String id);

    /** Id các bản nhạc nằm trong thùng rác từ trước {@code before}, tới hạn xóa hẳn. */
    @Query(value = "select id from scores where deleted_at is not null and deleted_at < :before", nativeQuery = true)
    List<String> findExpiredIds(@Param("before") LocalDateTime before);
}
