package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import com.ptit.music_be.dto.enums.CommentStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Góp ý gắn vào ô nhịp (mục 4.2). Góp ý gốc ({@code parent} null) có vùng neo và trạng thái; trả lời chỉ một cấp, trỏ về
 * góp ý gốc. {@code Score} lọc bản trong thùng rác bằng {@code @SQLRestriction} nên quan hệ để LAZY: service luôn nạp bản
 * nhạc qua {@code ScoreRepository} (đọc {@code getScore().getId()} không khởi tạo proxy).
 */
@Entity
@Table(name = "score_comments")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreComment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "score_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    Score score;

    /** Góp ý gốc được trả lời; null là góp ý gốc. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    ScoreComment parent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    Member author;

    @Column(nullable = false, length = 2000)
    String content;

    @Column(name = "start_measure")
    Integer startMeasure;

    @Column(name = "end_measure")
    Integer endMeasure;

    /** Chỉ góp ý một bè: id part trong MusicXML; null là mọi bè. */
    @Column(name = "part_id", length = 64)
    String partId;

    /** Danh sách noteId (JSON) nếu chọn nốt trong Editor. */
    @Column(name = "note_ids", columnDefinition = "JSON")
    String noteIds;

    /** Version MusicXML lúc viết. */
    @Column(name = "score_version")
    Integer scoreVersion;

    /** Số ô của bản nhạc lúc viết: khác số ô hiện tại thì vị trí có thể đã lệch. */
    @Column(name = "measure_count_at")
    Integer measureCountAt;

    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    CommentStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by")
    Member resolvedBy;

    @Column(name = "resolved_at")
    LocalDateTime resolvedAt;

    @Column(name = "edited_at")
    LocalDateTime editedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    public boolean isRoot() {
        return parent == null;
    }
}
