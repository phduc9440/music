package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;

import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(
        name = "ai_tasks",
        indexes = {
            @Index(name = "idx_ai_tasks_status", columnList = "status"),
            @Index(name = "idx_ai_tasks_score", columnList = "score_id")
        })
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AiTask {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    Score score;

    @Enumerated(EnumType.STRING)
    @Column(name = "task_type", nullable = false, length = 32)
    AiTaskType taskType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    AiTaskStatus status;

    /** 0 - 100 */
    @Column(name = "progress")
    @Builder.Default
    Integer progress = 0;

    @Column(name = "error_message", columnDefinition = "TEXT")
    String errorMessage;

    /** Free-form task output (MySQL JSON column), e.g. ids of generated files, page count. */
    @Column(name = "result_data", columnDefinition = "JSON")
    String resultData;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    LocalDateTime updatedAt;

    @Column(name = "started_at")
    LocalDateTime startedAt;

    @Column(name = "finished_at")
    LocalDateTime finishedAt;
}
