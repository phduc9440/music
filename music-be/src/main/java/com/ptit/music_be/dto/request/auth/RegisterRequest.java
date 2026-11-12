package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class RegisterRequest {

    // Deprecated: the email is the login identifier. Kept for older clients.
    String username;

    @Size(min = 8, message = "PASSWORD_INVALID")
    String password;

    @Email(message = "EMAIL_INVALID")
    String email;

    @Size(max = 30, message = "INVALID_REQUEST")
    String phone;

    @Size(max = 255, message = "INVALID_REQUEST")
    String fullName;

    @Size(max = 255, message = "INVALID_REQUEST")
    String address;

    /** Mã giới thiệu của người mời (tùy chọn). Mã sai thì vẫn đăng ký bình thường, chỉ không ghi người mời. */
    @Size(max = 16, message = "INVALID_REQUEST")
    String referralCode;
}
