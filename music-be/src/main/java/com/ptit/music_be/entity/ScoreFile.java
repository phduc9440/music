package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.ColumnDefault;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import com.ptit.music_be.dto.enums.FileType;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(
        name = "score_files",
        indexes = {@Index(name = "idx_score_files_score_type", columnList = "score_id, file_type")})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreFile {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    Score score;

    @Enumerated(EnumType.STRING)
    @Column(name = "file_type", nullable = false, length = 32)
    FileType fileType;

    @Column(name = "original_file_name")
    String originalFileName;

    /** Path relative to the storage root, e.g. scores/{scoreId}/original/1-xxx.pdf */
    @Column(name = "storage_path", nullable = false, length = 512)
    String storagePath;

    @Column(name = "content_type", length = 128)
    String contentType;

    @Column(name = "size_bytes")
    Long sizeBytes;

    /** Page order for multi-image uploads (1-based), null when not applicable. */
    @Column(name = "page_number")
    Integer pageNumber;

    /** Phiên bản của file. MUSICXML tăng mỗi lần lưu; file sinh ra (MIDI, MP3...) ghi version MusicXML nguồn. */
    @Column(name = "version")
    @ColumnDefault("1")
    @Builder.Default
    Integer version = 1;

    /** Chỉ một bản "hiện hành" cho mỗi (score, file_type); các bản cũ là false. */
    @Column(name = "is_current")
    @ColumnDefault("true")
    @Builder.Default
    Boolean isCurrent = true;

    /** Id của ai_task đã sinh ra file này (không đặt FK để xóa task không ảnh hưởng file). */
    @Column(name = "source_task_id", length = 36)
    String sourceTaskId;

    /** Thông tin thêm dạng JSON, ví dụ {"transpose":2,"tempoPercent":100}. */
    @Column(name = "meta", columnDefinition = "JSON")
    String meta;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
