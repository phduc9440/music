package com.ptit.music_be.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.TeamInvitation;

public interface TeamInvitationRepository extends JpaRepository<TeamInvitation, String> {

    @Query("select i from TeamInvitation i join fetch i.team where i.tokenHash = :hash")
    Optional<TeamInvitation> findByTokenHash(@Param("hash") String hash);

    /** Khóa lời mời lúc chấp nhận để mã chỉ dùng được một lần kể cả khi bấm hai lần cùng lúc. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from TeamInvitation i where i.tokenHash = :hash")
    Optional<TeamInvitation> findByTokenHashForUpdate(@Param("hash") String hash);

    /** Lời mời còn dùng được của team, mới nhất trước. */
    @Query("select i from TeamInvitation i where i.team.id = :teamId and i.status = 'PENDING' and i.expiresAt > :now"
            + " order by i.createdAt desc")
    List<TeamInvitation> findUsable(@Param("teamId") String teamId, @Param("now") LocalDateTime now);

    /** Lời mời theo email còn dùng được (để không mời trùng một người). */
    @Query("select i from TeamInvitation i where i.team.id = :teamId and lower(i.email) = lower(:email)"
            + " and i.status = 'PENDING' and i.expiresAt > :now")
    List<TeamInvitation> findUsableByEmail(
            @Param("teamId") String teamId, @Param("email") String email, @Param("now") LocalDateTime now);

    /** Lời mời theo email gửi cho tôi còn dùng được (mọi team), mới nhất trước. */
    @Query("select i from TeamInvitation i join fetch i.team join fetch i.invitedBy where lower(i.email) = lower(:email)"
            + " and i.status = 'PENDING' and i.expiresAt > :now order by i.createdAt desc")
    List<TeamInvitation> findUsableForEmail(@Param("email") String email, @Param("now") LocalDateTime now);

    /** Số lời mời còn chờ: tính vào hạn mức thành viên để không mời vượt. */
    @Query("select count(i) from TeamInvitation i where i.team.id = :teamId and i.status = 'PENDING'"
            + " and i.expiresAt > :now")
    long countUsable(@Param("teamId") String teamId, @Param("now") LocalDateTime now);
}
