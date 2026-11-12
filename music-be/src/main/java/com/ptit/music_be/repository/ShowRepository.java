package com.ptit.music_be.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.Show;

public interface ShowRepository extends JpaRepository<Show, String> {

    /** Show đang chuẩn bị trước (ngày diễn gần nhất trước, chưa đặt ngày xếp cuối), rồi tới show đã diễn. */
    @Query("select s from Show s where s.team.id = :teamId order by case when s.status = 'DONE' then 1 else 0 end,"
            + " case when s.showDate is null then 1 else 0 end, s.showDate, s.createdAt")
    List<Show> findByTeamOrdered(@Param("teamId") String teamId);

    long countByTeamId(String teamId);

    @Query("select s.team.id, count(s) from Show s where s.team.id in :teamIds and s.status = 'PREPARING'"
            + " group by s.team.id")
    List<Object[]> countPreparingByTeams(@Param("teamIds") Collection<String> teamIds);
}
