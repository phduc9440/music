package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.TeamRole;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Xem trước lời mời trước khi chấp nhận (trang /teams/invite/:token). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamInvitationPreviewResponse {
    String teamId;
    String teamName;
    String teamDescription;
    TeamRole role;
    String invitedByName;
    /** Lời mời gửi cho email này (null = link mời). */
    String email;
    LocalDateTime expiresAt;
    /** VALID / EXPIRED / USED / REVOKED. */
    String state;
    /** Người đang xem đã ở trong team. */
    boolean alreadyMember;
    /** Lời mời theo email nhưng người đang xem đăng nhập bằng email khác. */
    boolean emailMismatch;
}
