package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.SQLRestriction;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Bài trả lời trong một chủ đề (mục 5.5). */
@SQLRestriction("hidden_at IS NULL")
@Entity
@Table(name = "forum_posts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumPost {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "thread_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    ForumThread thread;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    Member author;

    /** Bài được trả lời trực tiếp (null = trả lời chủ đề). Chỉ đọc {@code getId()}: bài đó có thể đã bị ẩn. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_to_id")
    ForumPost replyTo;

    @Column(nullable = false, length = 10000)
    String body;

    @Column(name = "edited_at")
    LocalDateTime editedAt;

    @Column(name = "hidden_at")
    LocalDateTime hiddenAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hidden_by")
    Member hiddenBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
