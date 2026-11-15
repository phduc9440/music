package com.ptit.music_be.entity;

import java.time.LocalDateTime;

import jakarta.persistence.*;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "otps")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Otp {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(name = "otp_code", nullable = false)
    String otpCode;

    @Column(name = "expiry_time", nullable = false)
    LocalDateTime expiryTime;

    @Column(name = "attempts")
    Integer attempts;

    /**
     * Null: đang chờ nhập OTP. Có giá trị: OTP đã xác minh, đây là SHA-256 của mã phiên dùng một lần để đặt mật khẩu mới
     * (expiryTime lúc này là hạn của mã phiên).
     */
    @Column(name = "reset_token_hash", length = 64)
    String resetTokenHash;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    Member member;
}
