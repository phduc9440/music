package com.ptit.music_be.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.dto.enums.TeamRole;
import com.ptit.music_be.entity.TeamMember;

public interface TeamMemberRepository extends JpaRepository<TeamMember, String> {

    Optional<TeamMember> findByTeamIdAndMemberId(String teamId, String memberId);

    @Query("select tm from TeamMember tm join fetch tm.member where tm.team.id = :teamId order by tm.joinedAt, tm.id")
    List<TeamMember> findByTeamWithMember(@Param("teamId") String teamId);

    @Query("select tm from TeamMember tm join fetch tm.team where tm.member.id = :memberId order by tm.team.name")
    List<TeamMember> findByMemberWithTeam(@Param("memberId") String memberId);

    long countByTeamId(String teamId);

    long countByTeamIdAndRole(String teamId, TeamRole role);

    boolean existsByTeamIdAndMemberId(String teamId, String memberId);

    /** Số thành viên mỗi team (cho danh sách team của tôi). Hàng: [teamId, count]. */
    @Query("select tm.team.id, count(tm) from TeamMember tm where tm.team.id in :teamIds group by tm.team.id")
    List<Object[]> countByTeams(@Param("teamIds") Collection<String> teamIds);
}
