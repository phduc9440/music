package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.team.TeamInvitationStatus;
import com.ptit.music_be.dto.enums.team.TeamRole;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Lời mời vào team (bảng team_invitations): theo email, hoặc link mời ({@code email} null, dùng được một lần). */
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

    /** Email được mời; null = link mời (ai có link đều dùng được, một lần). */
    @Column(length = 255)
    String email;

    /** Vai trò khi vào team (không mời thẳng làm OWNER). */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    TeamRole role;

    /** Trạng thái (hết hạn suy ra từ {@link #expiresAt}). */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    TeamInvitationStatus status;

    /** SHA-256 của mã mời; mã gốc chỉ trả về một lần lúc tạo. */
    @Column(name = "token_hash", nullable = false, length = 64)
    String tokenHash;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invited_by")
    Member invitedBy;

    @Column(name = "expires_at", nullable = false)
    LocalDateTime expiresAt;

    /** Người đã chấp nhận (null khi chưa). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "accepted_by")
    Member acceptedBy;

    @Column(name = "accepted_at")
    LocalDateTime acceptedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    /** Lời mời còn dùng được: đang chờ và chưa hết hạn. */
    public boolean isUsable(LocalDateTime now) {
        return status == TeamInvitationStatus.PENDING && expiresAt != null && expiresAt.isAfter(now);
    }
}
