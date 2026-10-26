package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "practice_sessions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PracticeSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id", nullable = false)
    Score score;

    @Column(name = "mode")
    String mode;

    @Column(name = "tempo_percent")
    Double tempoPercent;

    @Column(name = "loop_start_measure")
    Integer loopStartMeasure;

    @Column(name = "loop_end_measure")
    Integer loopEndMeasure;

    @Column(name = "started_at")
    LocalDateTime startedAt;

    @Column(name = "ended_at")
    LocalDateTime endedAt;

    @Column(name = "duration_seconds")
    Integer durationSeconds;

    @Column(name = "total_notes")
    Integer totalNotes;

    @Column(name = "perfect_count")
    Integer perfectCount;

    @Column(name = "early_count")
    Integer earlyCount;

    @Column(name = "late_count")
    Integer lateCount;

    @Column(name = "wrong_pitch_count")
    Integer wrongPitchCount;

    @Column(name = "missed_count")
    Integer missedCount;

    @Column(name = "accuracy_pct")
    Double accuracyPct;

    @Column(name = "timing_accuracy_pct")
    Double timingAccuracyPct;

    @Column(name = "score_points")
    Double scorePoints;

    @Column(name = "is_completed")
    Boolean isCompleted;
}
