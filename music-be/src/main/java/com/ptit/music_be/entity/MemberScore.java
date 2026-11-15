package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import com.ptit.music_be.converter.SharePermissionConverter;
import com.ptit.music_be.dto.enums.score.SharePermission;
import com.ptit.music_be.dto.enums.score.ShareSource;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(
        name = "member_scores",
        uniqueConstraints = {@UniqueConstraint(columnNames = {"member_id", "score_id"})})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MemberScore {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "score_id", nullable = false)
    Score score;

    /** Cấp đã được cấp; null khi mới chỉ xin (xem {@link #requestedPermission}). */
    @Convert(converter = SharePermissionConverter.class)
    @Column(name = "permission")
    SharePermission permission;

    /** DIRECT: chủ cấp/duyệt. LINK: vào bằng liên kết (bị thu hồi khi chủ tắt hoặc tạo lại liên kết). */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 16)
    @Builder.Default
    ShareSource source = ShareSource.DIRECT;

    /**
     * Cấp đang xin; khác null nghĩa là có yêu cầu đang chờ chủ sở hữu duyệt. Khi {@link #permission} cũng null thì
     * người này mới chỉ xin, chưa có quyền gì.
     */
    @Convert(converter = SharePermissionConverter.class)
    @Column(name = "requested_permission")
    SharePermission requestedPermission;

    @Column(name = "request_message", length = 500)
    String requestMessage;

    @Column(name = "requested_at")
    LocalDateTime requestedAt;
}
