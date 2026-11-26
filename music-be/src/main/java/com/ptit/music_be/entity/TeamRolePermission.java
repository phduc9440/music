package com.ptit.music_be.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.team.TeamRole;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Quyền của một vai trò trong team do chủ nhóm chỉnh (bảng team_role_permissions, khóa team + vai trò). Vai trò chưa có
 * dòng thì dùng quyền mặc định ({@code TeamPermission.defaultsOf}).
 */
@Entity
@Table(name = "team_role_permissions")
@IdClass(TeamRolePermission.Key.class)
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamRolePermission {

    @Id
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    Team team;

    /** MANAGER / ARRANGER / VIEWER (chủ nhóm luôn có mọi quyền nên không có dòng). */
    @Id
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    TeamRole role;

    /** Mảng JSON tên {@code TeamPermission}. */
    @Column(name = "permissions", nullable = false, columnDefinition = "JSON")
    String permissions;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    /** Khóa chính ghép: id team + vai trò. */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Key implements Serializable {
        String team;
        TeamRole role;
    }
}
