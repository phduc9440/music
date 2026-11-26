package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.team.TeamActivityType;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một dòng nhật ký hoạt động của team (bảng team_activities, tab Hoạt động). */
@Entity
@Table(name = "team_activities")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamActivity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    Team team;

    /** Người làm (null nếu tài khoản không còn). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    Member member;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    TeamActivityType type;

    /** Tham số JSON (tên bài, tên người, vai trò...) để web dựng câu theo ngôn ngữ người đọc. */
    @Column(name = "params", columnDefinition = "JSON")
    String params;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
