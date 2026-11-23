package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.billing.PaymentKind;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Một lần SUPER_ADMIN cấp gói thủ công (nguồn ADMIN_GRANT). Cấp nối tiếp cùng gói chỉ cộng hạn vào một dòng
 * {@link Subscription} nên mỗi lần cấp được ghi lại ở đây để người dùng và quản trị xem lại lịch sử.
 */
@Entity
@Table(name = "plan_grants")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlanGrant {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    Plan plan;

    /** SUPER_ADMIN đã cấp. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "granted_by")
    Member grantedBy;

    @Column(nullable = false)
    int months;

    /** NEW: cấp mới hoặc đổi gói; RENEW: gia hạn nối tiếp đúng gói đang dùng. */
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    PaymentKind kind = PaymentKind.NEW;

    @Column(name = "starts_at", nullable = false)
    LocalDateTime startsAt;

    /** Hạn của gói ngay sau lần cấp này. */
    @Column(name = "expires_at", nullable = false)
    LocalDateTime expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
