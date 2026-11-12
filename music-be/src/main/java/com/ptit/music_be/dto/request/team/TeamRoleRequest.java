package com.ptit.music_be.dto.request.team;

import com.ptit.music_be.dto.enums.team.TeamRole;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Đổi vai trò một thành viên team. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamRoleRequest {
    TeamRole role;
}
