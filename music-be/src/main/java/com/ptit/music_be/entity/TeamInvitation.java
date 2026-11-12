package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.TeamInvitationStatus;
import com.ptit.music_be.dto.enums.TeamRole;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Lời mời vào team. Chỉ lưu SHA-256 của mã mời; mã gốc chỉ trả về một lần lúc tạo. */
@Entity
@Table(name = "team_invitations")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamInvitation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    Team team;

    /** Mời theo email; null = link mời (ai có link đều dùng được, một lần). */
    @Column(length = 255)
    String email;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    TeamRole role;

    @Column(name = "token_hash", nullable = false, length = 64)
    String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    TeamInvitationStatus status;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invited_by", nullable = false)
    Member invitedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "accepted_by")
    Member acceptedBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    LocalDateTime expiresAt;

    @Column(name = "accepted_at")
    LocalDateTime acceptedAt;

    /** Còn dùng được: đang chờ và chưa hết hạn. */
    public boolean isUsable(LocalDateTime now) {
        return status == TeamInvitationStatus.PENDING && expiresAt.isAfter(now);
    }
}
