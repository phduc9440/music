package com.ptit.music_be.entity;

import jakarta.persistence.*;

import com.ptit.music_be.dto.enums.notification.NotificationCategory;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Lựa chọn nhận thông báo của một người cho một nhóm (mục R8). Chưa có hàng nghĩa là mặc định: hiện trong ứng dụng, không
 * gửi email. Cả hai tắt thì không tạo thông báo.
 */
@Entity
@Table(
        name = "notification_preferences",
        uniqueConstraints = @UniqueConstraint(name = "uk_notification_pref", columnNames = {"member_id", "category"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class NotificationPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 16)
    NotificationCategory category;

    /** Hiện trong chuông thông báo của ứng dụng. */
    @Column(name = "in_app", nullable = false)
    boolean inApp;

    /** Đưa vào email tóm tắt hằng ngày. */
    @Column(name = "email", nullable = false)
    boolean email;
}
