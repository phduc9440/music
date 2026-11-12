package com.ptit.music_be.dto.response.score;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.score.SharePermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một yêu cầu xin quyền đang chờ chủ sở hữu duyệt. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AccessRequestResponse {
    String memberId;
    String email;
    String fullName;
    /** Cấp người này đang xin. */
    SharePermission requestedPermission;
    /** Cấp họ đang có (null nếu chưa có quyền gì). */
    SharePermission currentPermission;

    String message;
    LocalDateTime requestedAt;
}
