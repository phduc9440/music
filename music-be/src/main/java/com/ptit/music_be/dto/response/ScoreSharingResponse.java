package com.ptit.music_be.dto.response;

import java.util.List;

import com.ptit.music_be.dto.enums.SharePermission;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Trạng thái chia sẻ của một bản nhạc (chỉ chủ sở hữu hoặc ADMIN xem được). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreSharingResponse {
    /** Có đang bật chia sẻ bằng liên kết không. */
    boolean linkEnabled;
    /** Quyền của bất kỳ ai có liên kết; null khi tắt. */
    SharePermission linkPermission;
    /** Mã trong liên kết (frontend ghép thành /s/{shareToken}); null khi chưa từng bật. */
    String shareToken;
    List<ShareMemberResponse> members;
    /** Số yêu cầu xin quyền đang chờ duyệt. */
    long pendingRequests;
}
