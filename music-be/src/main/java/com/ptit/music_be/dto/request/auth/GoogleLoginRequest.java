package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class GoogleLoginRequest {
    @NotBlank(message = "ID Token is required")
    String idToken;

    /** Mã giới thiệu (7.5), chỉ dùng khi lần đăng nhập Google này tạo tài khoản mới. */
    @Size(max = 16, message = "INVALID_REQUEST")
    String referralCode;
}
