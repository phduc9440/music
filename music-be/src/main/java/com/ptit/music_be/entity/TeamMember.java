package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.team.TeamRole;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Thành viên của team (bảng team_members). Lời mời, nhật ký hoạt động và quyền theo vai trò nằm ở bảng riêng
 * ({@link TeamInvitation}, {@link TeamActivity}, {@link TeamRolePermission}).
 */
@Entity
@Table(name = "team_members")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamMember {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    Team team;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    TeamRole role;

    @Column(name = "joined_at")
    LocalDateTime joinedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    /** Chưa ghi lúc vào team thì lấy lúc lưu. */
    @PrePersist
    void fillJoinedAt() {
        if (joinedAt == null) {
            joinedAt = LocalDateTime.now();
        }
    }
}
