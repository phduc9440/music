package com.ptit.music_be.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.ptit.music_be.dto.enums.ShowItemStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Một bài trong show. Bản nhạc giữ bằng id (không phải quan hệ) vì Score lọc bản trong thùng rác: bài có bản nhạc đang ở
 * thùng rác vẫn còn dòng nhưng không hiện; bản bị xóa hẳn thì DB xóa theo dòng này (ON DELETE CASCADE).
 */
@Entity
@Table(name = "show_items")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShowItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "show_id", nullable = false)
    Show show;

    @Column(name = "score_id", nullable = false, length = 36)
    String scoreId;

    @Column(nullable = false)
    int position;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "arranger_id")
    Member arranger;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewer_id")
    Member reviewer;

    @Column(name = "due_date")
    LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    ShowItemStatus status;

    @Column(length = 500)
    String notes;

    /** Góp ý của lần trả lại gần nhất (xóa khi bài được duyệt). */
    @Column(name = "review_note", length = 500)
    String reviewNote;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    LocalDateTime updatedAt;
}
