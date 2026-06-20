package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ResetPasswordRequest {

    @NotBlank(message = "EMAIL_REQUIRED")
    @Email(message = "EMAIL_INVALID")
    String email;

    @NotBlank(message = "OTP_REQUIRED")
    String otp;

    @NotBlank(message = "PASSWORD_REQUIRED")
    @Size(min = 8, message = "PASSWORD_INVALID")
    String newPassword;
}
