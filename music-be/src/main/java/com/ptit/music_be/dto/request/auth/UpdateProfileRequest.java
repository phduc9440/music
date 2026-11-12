package com.ptit.music_be.dto.request.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UpdateProfileRequest {

    @NotBlank(message = "FULL_NAME_REQUIRED")
    @Size(max = 255, message = "INVALID_REQUEST")
    String fullName;

    @Size(max = 30, message = "INVALID_REQUEST")
    String phone;

    @Size(max = 255, message = "INVALID_REQUEST")
    String address;
}
