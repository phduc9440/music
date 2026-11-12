package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.team.TeamActivityType;
import com.ptit.music_be.dto.enums.team.TeamInvitationStatus;
import com.ptit.music_be.dto.enums.team.TeamMemberKind;
import com.ptit.music_be.dto.enums.team.TeamRole;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Một dòng của bảng team_members: thành viên, lời mời hoặc nhật ký hoạt động của team, phân biệt bằng {@link #kind}. Mỗi
 * loại chỉ dùng một phần các trường (xem {@link TeamMemberKind}); mọi truy vấn phải lọc theo kind (các truy vấn đã viết sẵn
 * trong TeamMemberRepository đều lọc).
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    @Builder.Default
    TeamMemberKind kind = TeamMemberKind.MEMBER;

    /** MEMBER: thành viên; INVITATION: người đã chấp nhận (null khi chưa); ACTIVITY: người làm. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    Member member;

    /** INVITATION: email được mời; null = link mời (ai có link đều dùng được, một lần). */
    @Column(length = 255)
    String email;

    /** MEMBER, INVITATION: vai trò trong team (không mời thẳng làm OWNER). */
    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    TeamRole role;

    /** INVITATION: trạng thái lời mời (hết hạn suy ra từ expiresAt). */
    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    TeamInvitationStatus status;

    /** INVITATION: SHA-256 của mã mời; mã gốc chỉ trả về một lần lúc tạo. */
    @Column(name = "token_hash", length = 64)
    String tokenHash;

    /** INVITATION: người mời. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invited_by")
    Member invitedBy;

    /** INVITATION: hết hạn lúc này. */
    @Column(name = "expires_at")
    LocalDateTime expiresAt;

    /** ACTIVITY: loại hoạt động. */
    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    TeamActivityType type;

    /** ACTIVITY: tham số JSON (tên bài, tên người, vai trò...) để web dựng câu. */
    @Column(name = "params", columnDefinition = "JSON")
    String params;

    /** MEMBER: lúc vào team; INVITATION: lúc được chấp nhận. */
    @Column(name = "joined_at")
    LocalDateTime joinedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    /** Thành viên mới mà chưa ghi lúc vào team thì lấy lúc lưu. */
    @PrePersist
    void fillJoinedAt() {
        if (kind == TeamMemberKind.MEMBER && joinedAt == null) {
            joinedAt = LocalDateTime.now();
        }
    }

    /** Lời mời còn dùng được: đang chờ và chưa hết hạn. */
    public boolean isUsableInvitation(LocalDateTime now) {
        return kind == TeamMemberKind.INVITATION
                && status == TeamInvitationStatus.PENDING
                && expiresAt != null
                && expiresAt.isAfter(now);
    }
}
