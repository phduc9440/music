package com.ptit.music_be.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.TeamActivity;

public interface TeamActivityRepository extends JpaRepository<TeamActivity, String> {

    @Query(value = "select a from TeamActivity a left join fetch a.actor where a.teamId = :teamId"
                    + " order by a.createdAt desc, a.id desc",
            countQuery = "select count(a) from TeamActivity a where a.teamId = :teamId")
    Page<TeamActivity> findByTeam(@Param("teamId") String teamId, Pageable pageable);
}
