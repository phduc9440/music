package com.ptit.music_be.dto.request.team;

import java.util.List;
import java.util.Map;

import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Chủ nhóm đặt lại quyền của các vai trò: mỗi khóa là một vai trò chỉnh được (MANAGER / ARRANGER / VIEWER) kèm toàn bộ quyền
 * được bật của vai trò đó; vai trò không có trong map thì giữ nguyên. Quyền phải có kèm được tự bật thêm.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamPermissionsRequest {
    Map<TeamRole, List<TeamPermission>> roles;
}
