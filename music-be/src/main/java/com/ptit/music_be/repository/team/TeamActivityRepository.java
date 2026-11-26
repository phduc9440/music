package com.ptit.music_be.repository.team;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.TeamActivity;

/** Nhật ký hoạt động của team (bảng team_activities). */
public interface TeamActivityRepository extends JpaRepository<TeamActivity, String> {
    // ------------------------------------------------------------------------------------------------ nhật ký

    @Query(
            value = "select a from TeamActivity a left join fetch a.member where"
                    + " a.team.id = :teamId order by a.createdAt desc, a.id desc",
            countQuery = "select count(a) from TeamActivity a where a.team.id = :teamId")
    Page<TeamActivity> findActivities(@Param("teamId") String teamId, Pageable pageable);
}
