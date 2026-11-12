package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.dto.enums.TeamRole;
import com.ptit.music_be.entity.TeamMember;

/**
 * Bảng team_members chứa ba loại dòng (thành viên, lời mời, nhật ký); mọi truy vấn ở đây đều lọc theo kind. Đừng dùng
 * findById / findAll / count có sẵn của JpaRepository cho một loại cụ thể vì chúng không lọc kind.
 */
public interface TeamMemberRepository extends JpaRepository<TeamMember, String> {

    // ------------------------------------------------------------------------------------------------ thành viên

    @Query("select tm from TeamMember tm where tm.kind = 'MEMBER' and tm.team.id = :teamId and tm.member.id = :memberId")
    Optional<TeamMember> findByTeamIdAndMemberId(@Param("teamId") String teamId, @Param("memberId") String memberId);

    @Query("select tm from TeamMember tm join fetch tm.member where tm.kind = 'MEMBER' and tm.team.id = :teamId"
            + " order by tm.joinedAt, tm.id")
    List<TeamMember> findByTeamWithMember(@Param("teamId") String teamId);

    @Query("select tm from TeamMember tm join fetch tm.team where tm.kind = 'MEMBER' and tm.member.id = :memberId"
            + " order by tm.team.name")
    List<TeamMember> findByMemberWithTeam(@Param("memberId") String memberId);

    @Query("select count(tm) from TeamMember tm where tm.kind = 'MEMBER' and tm.team.id = :teamId")
    long countByTeamId(@Param("teamId") String teamId);

    @Query("select count(tm) from TeamMember tm where tm.kind = 'MEMBER' and tm.team.id = :teamId and tm.role = :role")
    long countByTeamIdAndRole(@Param("teamId") String teamId, @Param("role") TeamRole role);

    @Query("select count(tm) > 0 from TeamMember tm where tm.kind = 'MEMBER' and tm.team.id = :teamId"
            + " and tm.member.id = :memberId")
    boolean existsByTeamIdAndMemberId(@Param("teamId") String teamId, @Param("memberId") String memberId);

    /** Số thành viên mỗi team (cho danh sách team của tôi). Hàng: [teamId, count]. */
    @Query("select tm.team.id, count(tm) from TeamMember tm where tm.kind = 'MEMBER' and tm.team.id in :teamIds"
            + " group by tm.team.id")
    List<Object[]> countByTeams(@Param("teamIds") Collection<String> teamIds);

    // ------------------------------------------------------------------------------------------------ lời mời

    @Query("select i from TeamMember i where i.kind = 'INVITATION' and i.id = :id")
    Optional<TeamMember> findInvitationById(@Param("id") String id);

    @Query("select i from TeamMember i join fetch i.team where i.kind = 'INVITATION' and i.tokenHash = :hash")
    Optional<TeamMember> findInvitationByTokenHash(@Param("hash") String hash);

    /** Khóa lời mời lúc chấp nhận để mã chỉ dùng được một lần kể cả khi bấm hai lần cùng lúc. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from TeamMember i where i.kind = 'INVITATION' and i.tokenHash = :hash")
    Optional<TeamMember> findInvitationByTokenHashForUpdate(@Param("hash") String hash);

    /** Lời mời còn dùng được của team, mới nhất trước. */
    @Query("select i from TeamMember i where i.kind = 'INVITATION' and i.team.id = :teamId and i.status = 'PENDING'"
            + " and i.expiresAt > :now order by i.createdAt desc")
    List<TeamMember> findUsableInvitations(@Param("teamId") String teamId, @Param("now") LocalDateTime now);

    /** Lời mời theo email còn dùng được (để không mời trùng một người). */
    @Query("select i from TeamMember i where i.kind = 'INVITATION' and i.team.id = :teamId"
            + " and lower(i.email) = lower(:email) and i.status = 'PENDING' and i.expiresAt > :now")
    List<TeamMember> findUsableInvitationsByEmail(
            @Param("teamId") String teamId, @Param("email") String email, @Param("now") LocalDateTime now);

    /** Lời mời theo email gửi cho tôi còn dùng được (mọi team), mới nhất trước. */
    @Query("select i from TeamMember i join fetch i.team join fetch i.invitedBy where i.kind = 'INVITATION'"
            + " and lower(i.email) = lower(:email) and i.status = 'PENDING' and i.expiresAt > :now"
            + " order by i.createdAt desc")
    List<TeamMember> findUsableInvitationsForEmail(@Param("email") String email, @Param("now") LocalDateTime now);

    /** Số lời mời còn chờ: tính vào hạn mức thành viên để không mời vượt. */
    @Query("select count(i) from TeamMember i where i.kind = 'INVITATION' and i.team.id = :teamId"
            + " and i.status = 'PENDING' and i.expiresAt > :now")
    long countUsableInvitations(@Param("teamId") String teamId, @Param("now") LocalDateTime now);

    // ------------------------------------------------------------------------------------------------ nhật ký

    @Query(value = "select a from TeamMember a left join fetch a.member where a.kind = 'ACTIVITY'"
                    + " and a.team.id = :teamId order by a.createdAt desc, a.id desc",
            countQuery = "select count(a) from TeamMember a where a.kind = 'ACTIVITY' and a.team.id = :teamId")
    Page<TeamMember> findActivities(@Param("teamId") String teamId, Pageable pageable);
}
