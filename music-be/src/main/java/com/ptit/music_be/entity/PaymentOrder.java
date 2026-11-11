package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.BillingPeriod;
import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.dto.enums.PaymentStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Đơn mua gói qua cổng thanh toán. Gói chỉ được bật khi đơn chuyển sang PAID từ thông báo (IPN) đã kiểm chữ ký. */
@Entity
@Table(name = "payment_orders")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PaymentOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(name = "order_code", nullable = false, unique = true, length = 40)
    String orderCode;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    Plan plan;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    BillingPeriod period;

    /** Số tiền VND (số nguyên). */
    @Column(nullable = false)
    long amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    PaymentProviderType provider;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    PaymentStatus status;

    /** Mã giao dịch phía cổng (duy nhất). */
    @Column(name = "provider_txn_id", unique = true, length = 64)
    String providerTxnId;

    /** Dữ liệu thô cổng gửi về (JSON), để đối soát. */
    @Column(name = "raw_payload", columnDefinition = "TEXT")
    String rawPayload;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    LocalDateTime expiresAt;

    @Column(name = "paid_at")
    LocalDateTime paidAt;
}
