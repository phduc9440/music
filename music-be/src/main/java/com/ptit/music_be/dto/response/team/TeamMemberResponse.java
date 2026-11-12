package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.TeamRole;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một thành viên team. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamMemberResponse {
    String memberId;
    String fullName;
    String email;
    String avatarUrl;
    TeamRole role;
    LocalDateTime joinedAt;
}
