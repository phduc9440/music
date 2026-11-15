package com.ptit.music_be.repository;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.entity.Score;

@Repository
public interface PracticeSessionRepository extends JpaRepository<PracticeSession, String> {

    List<PracticeSession> findByMember(Member member);

    List<PracticeSession> findByMemberAndScore(Member member, Score score);

    Optional<PracticeSession> findByMemberAndStatus(Member member, PracticeSessionStatus status);

    Optional<PracticeSession> findByIdAndMember(String id, Member member);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from PracticeSession session where session.id = :id and session.member = :member")
    Optional<PracticeSession> findByIdAndMemberForUpdate(@Param("id") String id, @Param("member") Member member);

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
            @Param("cutoff") java.time.LocalDateTime cutoff,
            @Param("endedAt") java.time.LocalDateTime endedAt);
}
