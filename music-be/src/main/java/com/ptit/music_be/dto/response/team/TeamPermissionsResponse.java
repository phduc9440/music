package com.ptit.music_be.dto.response.team;

import java.util.List;
import java.util.Map;

import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Bảng "Mỗi vai trò làm được gì" của team: quyền đang bật của từng vai trò chỉnh được, quyền mặc định, ai sửa được. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamPermissionsResponse {
    /** Quyền đang bật của MANAGER / ARRANGER / VIEWER (chủ nhóm luôn có mọi quyền nên không có ở đây). */
    Map<TeamRole, List<TeamPermission>> roles;
    /** Quyền mặc định của từng vai trò, cho nút "Đặt lại mặc định". */
    Map<TeamRole, List<TeamPermission>> defaults;
    /** Người đang xem là chủ nhóm: được tích / bỏ tích. */
    boolean editable;
}
