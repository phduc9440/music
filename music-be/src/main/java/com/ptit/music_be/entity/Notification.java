package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.notification.NotificationType;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "notifications")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false)
    Member recipient;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 32)
    NotificationType type;

    /** Bản nhạc liên quan (không đặt khóa ngoại để xóa bản nhạc không bị chặn). */
    @Column(name = "score_id", length = 36)
    String scoreId;

    @Column(nullable = false, length = 500)
    String message;

    /** Tham số của thông báo dạng JSON (title, name, level, reason...), để web dựng câu theo ngôn ngữ của người đọc. */
    @Column(name = "params", columnDefinition = "JSON")
    String params;

    @Column(name = "is_read", nullable = false)
    @Builder.Default
    boolean read = false;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
