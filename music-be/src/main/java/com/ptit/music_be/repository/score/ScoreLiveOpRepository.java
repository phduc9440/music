package com.ptit.music_be.repository.score;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.ScoreLiveOp;

public interface ScoreLiveOpRepository extends JpaRepository<ScoreLiveOp, ScoreLiveOp.Key> {

    /** Thao tác có seq lớn hơn {@code seq}, cũ trước; dùng {@code Pageable} để chặn số lượng. */
    List<ScoreLiveOp> findByScoreIdAndSeqGreaterThanOrderBySeqAsc(String scoreId, long seq, Pageable pageable);

    /** Seq lớn nhất đã ghi cho bản nhạc, 0 nếu chưa có. */
    @Query("select coalesce(max(o.seq), 0) from ScoreLiveOp o where o.scoreId = :scoreId")
    long maxSeq(@Param("scoreId") String scoreId);

    @Modifying
    @Query("delete from ScoreLiveOp o where o.createdAt < :before")
    int deleteCreatedBefore(@Param("before") LocalDateTime before);
}
