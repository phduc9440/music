package com.ptit.music_be.entity;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*;

import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UpdateTimestamp;

import com.ptit.music_be.dto.enums.DifficultyLevel;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "scores")
// Bản nhạc trong thùng rác (deleted_at khác null) tự biến mất khỏi mọi truy vấn JPA; xem ScoreTrashRepository
@SQLRestriction("deleted_at IS NULL")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Score {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id")
    Member member;

    @Column(nullable = false)
    String title;

    @Column(name = "composer")
    String composer;

    @Enumerated(EnumType.STRING)
    @Column(name = "difficulty")
    DifficultyLevel difficulty;

    @Column(name = "study_notes", columnDefinition = "TEXT")
    String studyNotes;

    @Column(name = "processing_status")
    String processingStatus;

    /** PRIVATE / PENDING (chủ xin công khai, chờ ADMIN duyệt) / PUBLIC (xem Visibility). */
    @Column(name = "visibility")
    String visibility;

    @Column(name = "is_official")
    Boolean isOfficial;

    @Column(name = "reject_reason")
    String rejectReason;

    @Column(name = "tempo_bpm")
    Integer tempoBpm;

    @Column(name = "measure_count")
    Integer measureCount;

    /** Khóa nhạc, ví dụ "G", "Bb", "F#m" (lấy từ MusicXML sau khi OMR xong). */
    @Column(name = "key_signature", length = 16)
    String keySignature;

    /** Số chỉ nhịp, ví dụ "3/4". */
    @Column(name = "time_signature", length = 8)
    String timeSignature;

    /** Số khuông nhạc (staff). Bằng 2 thì Player mới bật được Mute/Solo từng tay. */
    @Column(name = "staff_count")
    @ColumnDefault("2")
    @Builder.Default
    Integer staffCount = 2;

    /** Số trang của bản gốc (PDF/ảnh). */
    @Column(name = "page_count")
    Integer pageCount;

    /** Nguồn tạo bản nhạc: OMR / IMPORT / MANUAL (xem ScoreSource). */
    @Column(name = "source_type", length = 16)
    String sourceType;

    /** Phiên bản MusicXML hiện hành. Tăng mỗi lần Editor lưu (chống ghi đè nhau). 0 = chưa có MusicXML. */
    @Column(name = "current_version")
    @ColumnDefault("0")
    @Builder.Default
    Integer currentVersion = 0;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    LocalDateTime updatedAt;

    @Column(name = "view_count")
    @Builder.Default
    Long viewCount = 0L;

    /** Người xem có được tải MusicXML, MIDI, âm thanh, PDF, SVG không (chủ sở hữu và người sửa luôn được). */
    @Column(name = "allow_download", nullable = false)
    @Builder.Default
    boolean allowDownload = false;

    /** Thời điểm chuyển vào thùng rác; null là bản nhạc bình thường. */
    @Column(name = "deleted_at")
    LocalDateTime deletedAt;

    /** Id người đã xóa (chủ sở hữu hoặc ADMIN kiểm duyệt). */
    @Column(name = "deleted_by", length = 36)
    String deletedBy;

    @Column(name = "delete_reason", length = 500)
    String deleteReason;

    @OneToMany(mappedBy = "score", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<PlaylistItem> playlistItems = new ArrayList<>();

    @OneToMany(mappedBy = "score", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<MemberScore> memberScores = new ArrayList<>();

    @OneToMany(mappedBy = "score", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<ScoreTag> scoreTags = new ArrayList<>();

    @OneToMany(mappedBy = "score", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<PracticeSession> practiceSessions = new ArrayList<>();
}
