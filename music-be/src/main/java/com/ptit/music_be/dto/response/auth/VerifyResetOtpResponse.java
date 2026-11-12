package com.ptit.music_be.dto.response;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Mã OTP đúng: mã phiên dùng một lần để đặt mật khẩu mới ở bước 3. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class VerifyResetOtpResponse {
    /** Mã phiên (chỉ trả một lần, máy chủ chỉ lưu bản băm SHA-256). */
    String resetToken;
    /** Số giây còn dùng được mã phiên. */
    long expiresInSeconds;
}
