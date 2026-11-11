package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.RolePlanSuspension;

@Repository
public interface RolePlanSuspensionRepository extends JpaRepository<RolePlanSuspension, String> {

    /** Các lần tạm ngưng đang hiệu lực của một người (thường chỉ một), kết thúc muộn nhất trước. */
    @Query("select s from RolePlanSuspension s where s.memberId = :memberId and s.liftedAt is null"
            + " and s.startsAt <= :now and s.endsAt > :now order by s.endsAt desc")
    List<RolePlanSuspension> findActive(@Param("memberId") String memberId, @Param("now") LocalDateTime now);

    /** Tạm ngưng đang hiệu lực của nhiều người một lần (danh sách thành viên). */
    @Query("select s from RolePlanSuspension s where s.memberId in :memberIds and s.liftedAt is null"
            + " and s.startsAt <= :now and s.endsAt > :now")
    List<RolePlanSuspension> findActiveOfMembers(
            @Param("memberIds") Collection<String> memberIds, @Param("now") LocalDateTime now);
}
