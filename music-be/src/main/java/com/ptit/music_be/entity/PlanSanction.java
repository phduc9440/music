package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Một lần xử lý vi phạm về gói. {@code REVOKE}: gói đang dùng bị thu hồi (hủy ngay, muốn dùng lại phải mua lại).
 * {@code BAN}: cấm dùng gói {@code plan} từ {@code startsAt} đến {@code endsAt} (vẫn dùng Free hoặc mua gói khác); đang
 * hiệu lực khi chưa gỡ sớm và {@code startsAt <= hiện tại < endsAt}.
 */
@Entity
@Table(name = "plan_sanctions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlanSanction {

    public static final String REVOKE = "REVOKE";
    public static final String BAN = "BAN";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    /** Người bị xử lý. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @Column(nullable = false, length = 10)
    String type;

    /** Gói bị thu hồi (REVOKE) hoặc bị cấm dùng (BAN). */
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    Plan plan;

    /** REVOKE: gói (subscription) bị thu hồi; BAN: null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id")
    Subscription subscription;

    @Column(name = "starts_at", nullable = false)
    LocalDateTime startsAt;

    @Column(name = "ends_at")
    LocalDateTime endsAt;

    @Column(length = 255)
    String reason;

    /** SUPER_ADMIN thực hiện. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    Member createdBy;

    @Column(name = "lifted_at")
    LocalDateTime liftedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
