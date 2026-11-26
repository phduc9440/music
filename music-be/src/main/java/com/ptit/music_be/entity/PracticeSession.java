package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import com.ptit.music_be.converter.PracticeModeConverter;
import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.StudioHandMode;
import com.ptit.music_be.dto.enums.StudioInputSource;
import com.ptit.music_be.dto.enums.practice.PracticeMode;

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
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id", nullable = false)
    Score score;

    @Convert(converter = PracticeModeConverter.class)
    @Column(name = "mode")
    PracticeMode mode;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    PracticeSessionStatus status = PracticeSessionStatus.ABANDONED;

    @Enumerated(EnumType.STRING)
    @Column(name = "input_source")
    StudioInputSource inputSource;

    @Enumerated(EnumType.STRING)
    @Column(name = "hand_mode")
    StudioHandMode handMode;

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

    @Column(name = "covered_until_ms")
    Integer coveredUntilMs;

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

    // Ba cột dưới do MySQL tự tính từ các cột đếm (GENERATED ... STORED, xem V1): không ghi từ Java, Hibernate đọc lại
    // sau
    // mỗi lần lưu (3NF: không lưu giá trị suy ra được mà có thể bị ghi lệch)
    @Generated(event = {EventType.INSERT, EventType.UPDATE})
    @Column(name = "accuracy_pct", insertable = false, updatable = false)
    Double accuracyPct;

    @Generated(event = {EventType.INSERT, EventType.UPDATE})
    @Column(name = "timing_accuracy_pct", insertable = false, updatable = false)
    Double timingAccuracyPct;

    @Generated(event = {EventType.INSERT, EventType.UPDATE})
    @Column(name = "score_points", insertable = false, updatable = false)
    Double scorePoints;

    @Column(name = "is_completed")
    Boolean isCompleted;

    /** Log lỗi chi tiết từng nốt (mảng JSON), cột kiểu JSON trong MySQL. */
    @Column(name = "error_log", columnDefinition = "json")
    String errorLog;
}
