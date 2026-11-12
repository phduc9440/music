package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.TeamRole;

import lombok.*;
import lombok.experimental.FieldDefaults;

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

    @CreationTimestamp
    @Column(name = "joined_at", updatable = false)
    LocalDateTime joinedAt;
}
