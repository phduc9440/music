package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.SQLRestriction;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Chủ đề diễn đàn (mục 5.5). {@code Score} lọc bản trong thùng rác bằng {@code @SQLRestriction} nên quan hệ để LAZY và
 * service tra bản nhạc qua {@code ScoreRepository} (đọc {@code getScore().getId()} không khởi tạo proxy).
 */
@SQLRestriction("hidden_at IS NULL")
@Entity
@Table(name = "forum_threads")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumThread {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    ForumCategory category;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    Member author;

    /** Bản nhạc công khai gắn vào chủ đề (không bắt buộc). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id")
    Score score;

    @Column(nullable = false, length = 150)
    String title;

    /** Markdown thô; web thoát HTML khi hiển thị. */
    @Column(nullable = false, length = 10000)
    String body;

    /** Câu trả lời hay nhất do người đặt chủ đề chọn. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "accepted_post_id")
    ForumPost acceptedPost;

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
