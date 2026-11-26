package com.ptit.music_be.repository.team;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.TeamMember;

/**
 * Thành viên của team (bảng team_members). Các truy vấn mở cửa vào team (tư cách thành viên, team của tôi) bỏ qua team đã
 * xóa mềm ({@code team.deletedAt is not null}).
 */
public interface TeamMemberRepository extends JpaRepository<TeamMember, String> {

    // ------------------------------------------------------------------------------------------------ thành viên

    /** Tư cách thành viên trong team chưa bị xóa: cửa vào mọi quyền trên team (TeamAccess, quyền bản nhạc của team). */
    @Query("select tm from TeamMember tm join fetch tm.team t where t.id = :teamId"
            + " and tm.member.id = :memberId and t.deletedAt is null")
    Optional<TeamMember> findByTeamIdAndMemberId(@Param("teamId") String teamId, @Param("memberId") String memberId);

    /** Như {@link #findByTeamIdAndMemberId} nhưng tính cả team đã xóa (để khôi phục). */
    @Query("select tm from TeamMember tm join fetch tm.team t where t.id = :teamId" + " and tm.member.id = :memberId")
    Optional<TeamMember> findAnyStateByTeamIdAndMemberId(
            @Param("teamId") String teamId, @Param("memberId") String memberId);

    /** Team tôi là chủ, do chủ team xóa (không phải quản trị viên), xóa sau {@code since}: còn khôi phục được. */
    @Query("select tm from TeamMember tm join fetch tm.team t left join fetch t.deletedBy where"
            + " tm.member.id = :memberId and tm.role = 'OWNER' and t.deletedAt is not null and t.deletedAt > :since"
            + " and t.deletedByAdmin = false order by t.deletedAt desc")
    List<TeamMember> findRestorableOwnedBy(@Param("memberId") String memberId, @Param("since") LocalDateTime since);

    @Query("select tm from TeamMember tm join fetch tm.member where tm.team.id = :teamId"
            + " order by tm.joinedAt, tm.id")
    List<TeamMember> findByTeamWithMember(@Param("teamId") String teamId);

    @Query("select tm from TeamMember tm join fetch tm.team t where tm.member.id = :memberId"
            + " and t.deletedAt is null order by t.name")
    List<TeamMember> findByMemberWithTeam(@Param("memberId") String memberId);

    @Query("select count(tm) from TeamMember tm where tm.team.id = :teamId")
    long countByTeamId(@Param("teamId") String teamId);

    @Query("select count(tm) from TeamMember tm where tm.team.id = :teamId and tm.role = :role")
    long countByTeamIdAndRole(@Param("teamId") String teamId, @Param("role") TeamRole role);

    @Query("select count(tm) > 0 from TeamMember tm where tm.team.id = :teamId" + " and tm.member.id = :memberId")
    boolean existsByTeamIdAndMemberId(@Param("teamId") String teamId, @Param("memberId") String memberId);

    /** Số thành viên mỗi team (cho danh sách team của tôi). Hàng: [teamId, count]. */
    @Query("select tm.team.id, count(tm) from TeamMember tm where tm.team.id in :teamIds" + " group by tm.team.id")
    List<Object[]> countByTeams(@Param("teamIds") Collection<String> teamIds);
}
