package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Nhóm (ban nhạc, hợp xướng, lớp học) có không gian chung: bản nhạc, show, thành viên (mục 4.1). Xóa là xóa mềm
 * ({@code deletedAt}): mọi truy vấn phía người dùng phải lọc {@code deletedAt is null}; khôi phục được trong
 * {@link #RESTORE_DAYS} ngày, quá hạn thì giữ nguyên trong DB nhưng không khôi phục được (không xóa cứng).
 */
@Entity
@Table(name = "teams")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Team {

    /** Số ngày khôi phục được team hoặc show đã xóa. */
    public static final int RESTORE_DAYS = 30;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(nullable = false, length = 100)
    String name;

    @Column(length = 1000)
    String description;

    @Column(name = "avatar_url", length = 512)
    String avatarUrl;

    /** Người tạo: hạn mức số thành viên lấy theo gói đang dùng của người này. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false)
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

    /** Quản trị viên xóa (vi phạm): chủ team không tự khôi phục được. */
    @Builder.Default
    @Column(name = "deleted_by_admin", nullable = false)
    boolean deletedByAdmin = false;

    @Column(name = "deleted_reason", length = 500)
    String deletedReason;

    public boolean isDeleted() {
        return deletedAt != null;
    }

    /** Hạn cuối khôi phục được một thứ xóa lúc {@code deletedAt}; null nếu chưa xóa. */
    public static LocalDateTime restorableUntil(LocalDateTime deletedAt) {
        return deletedAt == null ? null : deletedAt.plusDays(RESTORE_DAYS);
    }

    /** Đã xóa và còn trong hạn khôi phục. */
    public static boolean restorable(LocalDateTime deletedAt, LocalDateTime now) {
        return deletedAt != null && restorableUntil(deletedAt).isAfter(now);
    }

    public void markDeleted(Member by, boolean byAdmin, String reason) {
        this.deletedAt = LocalDateTime.now();
        this.deletedBy = by;
        this.deletedByAdmin = byAdmin;
        this.deletedReason = reason;
    }

    public void restore() {
        this.deletedAt = null;
        this.deletedBy = null;
        this.deletedByAdmin = false;
        this.deletedReason = null;
    }
}
