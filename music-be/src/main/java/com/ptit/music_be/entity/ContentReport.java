package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.report.ReportAction;
import com.ptit.music_be.dto.enums.report.ReportReason;
import com.ptit.music_be.dto.enums.report.ReportStatus;
import com.ptit.music_be.dto.enums.report.ReportTargetType;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Báo cáo vi phạm (R5). Tên đối tượng và chủ nội dung không lưu ở đây mà tra từ bảng gốc khi trả về. {@code Score} và
 * {@code ScoreComment} lọc bản đã vào thùng rác / đã ẩn bằng {@code @SQLRestriction}, nên với hai quan hệ dưới chỉ đọc
 * {@code getId()} (không khởi tạo proxy); cần dữ liệu thì tra qua {@code ContentReportRepository#findScoreInfo}.
 */
@Entity
@Table(name = "content_reports")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ContentReport {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 20)
    ReportTargetType targetType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id")
    Score score;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comment_id")
    ScoreComment comment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reporter_id", nullable = false)
    Member reporter;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    ReportReason reason;

    @Column(length = 1000)
    String details;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    ReportStatus status;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    ReportAction action;

    @Column(name = "resolution_note", length = 500)
    String resolutionNote;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by")
    Member resolvedBy;

    @Column(name = "resolved_at")
    LocalDateTime resolvedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
