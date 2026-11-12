package com.ptit.music_be.dto.request.score;

import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.score.SharePermission;

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
