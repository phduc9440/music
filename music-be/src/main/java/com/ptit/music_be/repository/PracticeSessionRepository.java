package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;

@Repository
public interface PracticeSessionRepository extends JpaRepository<PracticeSession, String> {

    List<PracticeSession> findByMember(Member member);

    List<PracticeSession> findByMemberAndScore(Member member, Score score);

    Page<PracticeSession> findByMember(Member member, Pageable pageable);

    Page<PracticeSession> findByMemberAndScore(Member member, Score score, Pageable pageable);

    /**
     * Gom phiên tập theo ngày của started_at: [ngày, số phiên, tổng giây]. Chỉ tính phiên tập từ minSeconds giây trở
     * lên, trong khoảng [from, to).
     */
    @Query("select cast(s.startedAt as date), count(s), coalesce(sum(s.durationSeconds), 0)"
            + " from PracticeSession s"
            + " where s.member = :member and s.startedAt >= :from and s.startedAt < :to"
            + " and s.durationSeconds >= :minSeconds"
            + " group by cast(s.startedAt as date) order by cast(s.startedAt as date)")
    List<Object[]> sumByDay(
            @Param("member") Member member,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("minSeconds") int minSeconds);
}
