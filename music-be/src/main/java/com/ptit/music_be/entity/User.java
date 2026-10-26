package com.ptit.music_be.entity;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*;

import com.ptit.music_be.dto.enums.AuthProvider;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "users")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(nullable = false, unique = true)
    String email;

    @Column(name = "password_hash")
    String passwordHash;

    @Column(name = "status")
    String status;

    @Column(name = "email_verified")
    Boolean emailVerified;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_provider")
    AuthProvider authProvider;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<UserRole> userRoles = new ArrayList<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<Playlist> playlists = new ArrayList<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL)
    @Builder.Default
    List<Score> scores = new ArrayList<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<UserScore> userScores = new ArrayList<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<PracticeSession> practiceSessions = new ArrayList<>();
}
