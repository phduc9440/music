package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.TeamActivityType;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một dòng nhật ký hoạt động của team; params là JSON (tên bài, tên người, vai trò...) để web dựng câu. */
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

    @Column(name = "team_id", nullable = false, length = 36)
    String teamId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    Member actor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    TeamActivityType type;

    @Column(name = "params", columnDefinition = "JSON")
    String params;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
