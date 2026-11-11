package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.PlanSanction;

@Repository
public interface PlanSanctionRepository extends JpaRepository<PlanSanction, String> {

    /** Lệnh cấm đang hiệu lực của một người, hết hạn muộn nhất trước. */
    @Query("select s from PlanSanction s where s.memberId = :memberId and s.type = 'BAN' and s.liftedAt is null"
            + " and s.startsAt <= :now and s.endsAt > :now order by s.endsAt desc")
    List<PlanSanction> findActiveBans(@Param("memberId") String memberId, @Param("now") LocalDateTime now);

    /** Lệnh cấm đang hiệu lực của nhiều người một lần (danh sách thành viên). */
    @Query("select s from PlanSanction s where s.memberId in :memberIds and s.type = 'BAN' and s.liftedAt is null"
            + " and s.startsAt <= :now and s.endsAt > :now")
    List<PlanSanction> findActiveBansOfMembers(
            @Param("memberIds") Collection<String> memberIds, @Param("now") LocalDateTime now);
}
