package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Nhận xét của một người cho một bản nhạc: chấm sao (tùy chọn) và bình luận. Mỗi người một nhận xét, sửa được. */
@Entity
@Table(
        name = "score_reviews",
        uniqueConstraints = {@UniqueConstraint(columnNames = {"score_id", "member_id"})})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreReview {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    Score score;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    /** 1..5 sao; null = chỉ bình luận. */
    @Column(name = "rating")
    Integer rating;

    @Column(name = "comment", columnDefinition = "TEXT")
    String comment;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    LocalDateTime updatedAt;
}
