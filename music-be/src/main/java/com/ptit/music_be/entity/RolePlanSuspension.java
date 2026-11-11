package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Tạm ngưng quyền lợi gói Pro theo vai trò của một ADMIN trong một khoảng thời gian. Đang hiệu lực khi chưa mở lại sớm và
 * {@code startsAt <= hiện tại < endsAt}; hết {@code endsAt} thì ADMIN tự dùng lại Pro.
 */
@Entity
@Table(name = "role_plan_suspensions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RolePlanSuspension {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(name = "member_id", nullable = false, length = 36)
    String memberId;

    @Column(name = "starts_at", nullable = false)
    LocalDateTime startsAt;

    @Column(name = "ends_at", nullable = false)
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
