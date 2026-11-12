package com.ptit.music_be.dto.request.team;

import com.ptit.music_be.dto.enums.team.TeamRole;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Mời vào team: có email thì gửi lời mời qua email, không có thì tạo link mời (dùng một lần). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamInviteRequest {
    String email;
    /** MANAGER / ARRANGER / VIEWER. */
    TeamRole role;
}
