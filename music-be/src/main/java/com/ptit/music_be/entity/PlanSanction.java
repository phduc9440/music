package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Một lần xử lý vi phạm về gói. {@code REVOKE}: gói đang dùng bị thu hồi (hủy ngay, muốn dùng lại phải mua lại).
 * {@code BAN}: cấm dùng gói trả phí từ {@code startsAt} đến {@code endsAt}; đang hiệu lực khi chưa gỡ sớm và
 * {@code startsAt <= hiện tại < endsAt}.
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

    @Column(name = "member_id", nullable = false, length = 36)
    String memberId;

    @Column(nullable = false, length = 10)
    String type;

    @Column(name = "subscription_id", length = 36)
    String subscriptionId;

    @Column(name = "starts_at", nullable = false)
    LocalDateTime startsAt;

    @Column(name = "ends_at")
    LocalDateTime endsAt;

    @Column(length = 255)
    String reason;

    @Column(name = "created_by", length = 36)
    String createdBy;

    @Column(name = "lifted_at")
    LocalDateTime liftedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
