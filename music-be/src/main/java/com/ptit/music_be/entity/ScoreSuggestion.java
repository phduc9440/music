package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;

import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.dto.enums.score.SuggestionStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Đề xuất sửa bản nhạc (mục 4.3): một bản MusicXML do người có quyền nhận xét gửi, chia thành các thay đổi theo ô nhịp
 * ({@link ScoreSuggestionChange}). {@code Score} lọc bản trong thùng rác bằng {@code @SQLRestriction} nên quan hệ để LAZY:
 * service luôn nạp bản nhạc qua {@code ScoreRepository}.
 */
@Entity
@Table(name = "score_suggestions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreSuggestion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "score_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    Score score;

    /** Người đề xuất; null là hệ thống (gợi ý hợp âm). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    Member author;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    SuggestionSource source;

    /** Version MusicXML mà người gửi đã sửa trên đó. */
    @Column(name = "base_version", nullable = false)
    Integer baseVersion;

    /** Khung của version gốc dạng JSON: {@code {"parts":["P1"],"measures":[48]}}. */
    @Column(name = "base_shape", nullable = false, columnDefinition = "JSON")
    String baseShape;

    @Column(nullable = false, length = 200)
    String title;

    @Column(length = 2000)
    String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    SuggestionStatus status;

    /** Đổi khung, khóa hoặc nhịp: không chia được theo ô, chỉ nhận tất cả. */
    @Column(nullable = false)
    boolean structural;

    /** File MusicXML đề xuất; null khi đã dọn sau khi đóng quá hạn. */
    @Column(name = "storage_path", length = 512)
    String storagePath;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by")
    Member decidedBy;

    /** Lúc đóng đề xuất (nhận, từ chối hoặc rút lại). */
    @Column(name = "decided_at")
    LocalDateTime decidedAt;

    @Column(name = "decision_note", length = 500)
    String decisionNote;

    /** Version tạo ra khi nhận. */
    @Column(name = "applied_version")
    Integer appliedVersion;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    LocalDateTime updatedAt;
}
