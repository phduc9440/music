package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.SharePermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Chủ sở hữu mời trực tiếp một người (theo email) với một cấp quyền. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShareMemberRequest {
    @NotBlank(message = "INVALID_REQUEST")
    String email;

    @NotNull(message = "SHARE_PERMISSION_INVALID")
    SharePermission permission;
}
