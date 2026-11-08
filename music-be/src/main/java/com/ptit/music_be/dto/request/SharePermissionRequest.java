package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.SharePermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SharePermissionRequest {
    @NotNull(message = "SHARE_PERMISSION_INVALID")
    SharePermission permission;
}
