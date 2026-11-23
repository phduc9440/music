package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một người được @nhắc trong một góp ý hoặc trả lời (mục 4.2). */
@Entity
@Table(
        name = "score_comment_mentions",
        uniqueConstraints = {@UniqueConstraint(columnNames = {"comment_id", "member_id"})})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreCommentMention {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "comment_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    ScoreComment comment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
