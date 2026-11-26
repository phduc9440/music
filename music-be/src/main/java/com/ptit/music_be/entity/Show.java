package com.ptit.music_be.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.ptit.music_be.dto.enums.team.ShowStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Một buổi diễn của team: danh sách bài, mỗi bài giao người phối, người duyệt, hạn (mục 4.1). Xóa là xóa mềm
 * ({@code deletedAt}, bài giữ nguyên): truy vấn phải lọc {@code deletedAt is null}; khôi phục được trong
 * {@link Team#RESTORE_DAYS} ngày.
 */
@Entity
@Table(name = "shows")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Show {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "team_id", nullable = false)
    Team team;

    @Column(nullable = false)
    String name;

    @Column(name = "show_date")
    LocalDate showDate;

    @Column(length = 255)
    String venue;

    @Column(length = 2000)
    String notes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    ShowStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    Member createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    LocalDateTime updatedAt;

    @Column(name = "deleted_at")
    LocalDateTime deletedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deleted_by")
    Member deletedBy;
}
