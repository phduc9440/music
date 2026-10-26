package com.ptit.music_be.entity;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*;

import com.ptit.music_be.dto.enums.DifficultyLevel;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "scores")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Score {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    User user;

    @Column(nullable = false)
    String title;

    @Column(name = "composer")
    String composer;

    @Enumerated(EnumType.STRING)
    @Column(name = "difficulty")
    DifficultyLevel difficulty;

    @Column(name = "study_notes", columnDefinition = "TEXT")
    String studyNotes;

    @Column(name = "processing_status")
    String processingStatus;

    @Column(name = "visibility")
    String visibility;

    @Column(name = "is_official")
    Boolean isOfficial;

    @Column(name = "reject_reason")
    String rejectReason;

    @Column(name = "tempo_bpm")
    Integer tempoBpm;

    @Column(name = "measure_count")
    Integer measureCount;

    @Column(name = "view_count")
    @Builder.Default
    Long viewCount = 0L;

    @OneToMany(mappedBy = "score", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<PlaylistItem> playlistItems = new ArrayList<>();

    @OneToMany(mappedBy = "score", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<UserScore> userScores = new ArrayList<>();

    @OneToMany(mappedBy = "score", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<ScoreTag> scoreTags = new ArrayList<>();

    @OneToMany(mappedBy = "score", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<PracticeSession> practiceSessions = new ArrayList<>();
}
