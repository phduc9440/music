package com.ptit.music_be.dto.request;

import com.ptit.music_be.dto.enums.SharePermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Bật/đổi/tắt chia sẻ bằng liên kết. permission = null nghĩa là tắt liên kết. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreLinkRequest {
    SharePermission permission;
}
