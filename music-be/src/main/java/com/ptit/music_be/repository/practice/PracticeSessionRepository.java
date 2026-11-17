package com.ptit.music_be.repository.practice;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.practice.PracticeMode;

@Repository
public interface PracticeSessionRepository extends JpaRepository<PracticeSession, String> {

    List<PracticeSession> findByMember(Member member);

    List<PracticeSession> findByMemberAndScore(Member member, Score score);

    Page<PracticeSession> findByMember(Member member, Pageable pageable);

    Page<PracticeSession> findByMemberAndScore(Member member, Score score, Pageable pageable);

    Page<PracticeSession> findByMemberAndModeInAndStatus(
            Member member, Collection<PracticeMode> modes, PracticeSessionStatus status, Pageable pageable);

    Page<PracticeSession> findByMemberAndScoreAndModeInAndStatus(
            Member member, Score score, Collection<PracticeMode> modes, PracticeSessionStatus status, Pageable pageable);

    Optional<PracticeSession> findByIdAndMember(String id, Member member);

    Optional<PracticeSession> findFirstByMemberAndScoreAndModeInAndStatusAndStartedAtLessThanOrderByStartedAtDesc(
            Member member,
            Score score,
            Collection<PracticeMode> modes,
            PracticeSessionStatus status,
            LocalDateTime before);

    @Query("select max(session.scorePoints) from PracticeSession session"
            + " where session.member = :member and session.score = :score and session.mode in :modes"
            + " and session.status = :status and session.startedAt < :before")
    Double findBestStudioScoreBefore(
            @Param("member") Member member,
            @Param("score") Score score,
            @Param("modes") Collection<PracticeMode> modes,
            @Param("status") PracticeSessionStatus status,
            @Param("before") LocalDateTime before);

    @Query("select max(session.scorePoints) from PracticeSession session"
            + " where session.member = :member and session.score = :score and session.mode in :modes"
            + " and session.status = :status")
    Double findBestStudioScore(
            @Param("member") Member member,
            @Param("score") Score score,
            @Param("modes") Collection<PracticeMode> modes,
            @Param("status") PracticeSessionStatus status);

    Optional<PracticeSession> findByMemberAndStatus(Member member, PracticeSessionStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from PracticeSession session where session.id = :id and session.member = :member")
    Optional<PracticeSession> findByIdAndMemberForUpdate(
            @Param("id") String id, @Param("member") Member member);

    @Modifying
    @Query(
            """
			update PracticeSession session
			set session.status = :abandoned, session.endedAt = :endedAt, session.isCompleted = false
			where session.status = :inProgress and session.startedAt < :cutoff
			""")
    int abandonExpiredSessions(
            @Param("inProgress") PracticeSessionStatus inProgress,
            @Param("abandoned") PracticeSessionStatus abandoned,
            @Param("cutoff") LocalDateTime cutoff,
            @Param("endedAt") LocalDateTime endedAt);

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

    /**
     * Tổng hợp để chấm điểm kỹ năng trong [from, to), đúng một dòng:
     * [số phiên, tổng nốt, nốt đúng giờ, nốt sớm, nốt trễ, tổng (tempo x nốt), tổng nốt có tempo].
     */
    @Query("select count(s), coalesce(sum(s.totalNotes), 0), coalesce(sum(s.perfectCount), 0),"
            + " coalesce(sum(s.earlyCount), 0), coalesce(sum(s.lateCount), 0),"
            + " coalesce(sum(case when s.tempoPercent is not null then s.tempoPercent * s.totalNotes else 0 end), 0),"
            + " coalesce(sum(case when s.tempoPercent is not null then s.totalNotes else 0 end), 0)"
            + " from PracticeSession s"
            + " where s.member = :member and s.startedAt >= :from and s.startedAt < :to")
    List<Object[]> skillTotals(
            @Param("member") Member member, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
