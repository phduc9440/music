package com.ptit.music_be.dto.response.team;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.team.TeamRole;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Lời mời còn chờ. token chỉ có ngay lúc tạo (sau đó chỉ còn bản băm trong DB). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamInvitationResponse {
    String id;
    String teamId;
    String teamName;
    String email;
    TeamRole role;
    String invitedByName;
    LocalDateTime createdAt;
    LocalDateTime expiresAt;
    /** Chỉ có trong phản hồi tạo lời mời. */
    String token;
}
