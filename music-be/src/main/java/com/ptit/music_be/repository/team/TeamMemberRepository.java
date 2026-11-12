package com.ptit.music_be.repository.team;

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

import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.TeamMember;

/**
 * Bảng team_members chứa bốn loại dòng (thành viên, lời mời, nhật ký, bảng quyền); mọi truy vấn ở đây đều lọc theo
 * kind. Đừng dùng findById / findAll / count có sẵn của JpaRepository cho một loại cụ thể vì chúng không lọc kind. Các truy vấn mở cửa vào
 * team (tư cách thành viên, team của tôi, lời mời) bỏ qua team đã xóa mềm ({@code team.deletedAt is not null}).
 */
public interface TeamMemberRepository extends JpaRepository<TeamMember, String> {

    // ------------------------------------------------------------------------------------------------ thành viên

    /** Tư cách thành viên trong team chưa bị xóa: cửa vào mọi quyền trên team (TeamAccess, quyền bản nhạc của team). */
    @Query("select tm from TeamMember tm join fetch tm.team t where tm.kind = 'MEMBER' and t.id = :teamId"
            + " and tm.member.id = :memberId and t.deletedAt is null")
    Optional<TeamMember> findByTeamIdAndMemberId(@Param("teamId") String teamId, @Param("memberId") String memberId);

    /** Như {@link #findByTeamIdAndMemberId} nhưng tính cả team đã xóa (để khôi phục). */
    @Query("select tm from TeamMember tm join fetch tm.team t where tm.kind = 'MEMBER' and t.id = :teamId"
            + " and tm.member.id = :memberId")
    Optional<TeamMember> findAnyStateByTeamIdAndMemberId(
            @Param("teamId") String teamId, @Param("memberId") String memberId);

    /** Team tôi là chủ, do chủ team xóa (không phải quản trị viên), xóa sau {@code since}: còn khôi phục được. */
    @Query("select tm from TeamMember tm join fetch tm.team t left join fetch t.deletedBy where tm.kind = 'MEMBER'"
            + " and tm.member.id = :memberId and tm.role = 'OWNER' and t.deletedAt is not null and t.deletedAt > :since"
            + " and t.deletedByAdmin = false order by t.deletedAt desc")
    List<TeamMember> findRestorableOwnedBy(@Param("memberId") String memberId, @Param("since") LocalDateTime since);

    @Query("select tm from TeamMember tm join fetch tm.member where tm.kind = 'MEMBER' and tm.team.id = :teamId"
            + " order by tm.joinedAt, tm.id")
    List<TeamMember> findByTeamWithMember(@Param("teamId") String teamId);

    @Query("select tm from TeamMember tm join fetch tm.team t where tm.kind = 'MEMBER' and tm.member.id = :memberId"
            + " and t.deletedAt is null order by t.name")
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

    @Query("select i from TeamMember i join fetch i.team t where i.kind = 'INVITATION' and i.tokenHash = :hash"
            + " and t.deletedAt is null")
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
    @Query("select i from TeamMember i join fetch i.team t join fetch i.invitedBy where i.kind = 'INVITATION'"
            + " and t.deletedAt is null"
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

    // ------------------------------------------------------------------------------------------------ bảng quyền

    /** Các dòng bảng quyền (mỗi vai trò tối đa một dòng) của các team. */
    @Query("select p from TeamMember p join fetch p.team where p.kind = 'PERMISSION' and p.team.id in :teamIds")
    List<TeamMember> findPermissions(@Param("teamIds") Collection<String> teamIds);

    /** Dòng bảng quyền của một vai trò trong team (chưa có = vai trò đó dùng quyền mặc định). */
    @Query("select p from TeamMember p where p.kind = 'PERMISSION' and p.team.id = :teamId and p.role = :role")
    Optional<TeamMember> findPermission(@Param("teamId") String teamId, @Param("role") TeamRole role);
}
