package com.ptit.music_be.dto.response.score;

import com.ptit.music_be.dto.enums.score.SharePermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Quyền hiện có và yêu cầu đang chờ của người đang đăng nhập với một bản nhạc. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class MyAccessResponse {
    /** OWNER / EDIT / REVIEW / VIEW, null nếu chưa có quyền. */
    String accessLevel;
    /** Cấp đang xin và chờ duyệt, null nếu không có yêu cầu nào. */
    SharePermission requestedPermission;
}
