package com.ptit.music_be.repository.reward;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.PointsLedgerEntry;
import com.ptit.music_be.event.RewardReason;

public interface PointsLedgerRepository extends JpaRepository<PointsLedgerEntry, String> {

    boolean existsByReasonAndRefId(RewardReason reason, String refId);

    /** Số lần đã thưởng một lý do cho một người từ mốc {@code since} (áp giới hạn theo ngày/tuần/tháng). */
    long countByMemberIdAndReasonAndCreatedAtGreaterThanEqual(
            String memberId, RewardReason reason, LocalDateTime since);

    /** Tổng [xp, nốt] của một người. */
    @Query("select coalesce(sum(p.xp), 0), coalesce(sum(p.notes), 0) from PointsLedgerEntry p"
            + " where p.memberId = :memberId")
    List<Object[]> totalsOf(@Param("memberId") String memberId);

    List<PointsLedgerEntry> findTop20ByMemberIdOrderByCreatedAtDesc(String memberId);
}
