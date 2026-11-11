package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.dto.enums.SubscriptionSource;
import com.ptit.music_be.dto.enums.SubscriptionStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Gói đang dùng của một thành viên. Mỗi thành viên có tối đa một dòng ACTIVE còn hạn. */
@Entity
@Table(name = "subscriptions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    Plan plan;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    SubscriptionStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    SubscriptionSource source;

    @Column(name = "starts_at", nullable = false)
    LocalDateTime startsAt;

    @Column(name = "expires_at", nullable = false)
    LocalDateTime expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;
}
