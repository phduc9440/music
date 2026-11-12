package com.ptit.music_be.dto.request.score;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.ptit.music_be.dto.enums.score.SharePermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Người dùng xin quyền xem (1) hoặc chỉnh sửa (3) một bản nhạc. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AccessRequestRequest {
    @NotNull(message = "SHARE_PERMISSION_INVALID")
    SharePermission permission;

    @Size(max = 500, message = "INVALID_REQUEST")
    String message;
}
