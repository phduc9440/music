package com.ptit.music_be.service.team;

import java.util.EnumSet;
import java.util.Set;

import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;

/**
 * Quyền của một người trong một team: vai trò và các quyền vai trò đó đang được bật theo bảng quyền của team. Chủ nhóm luôn
 * có mọi quyền, không phụ thuộc bảng.
 */
public record RolePermissions(TeamRole role, Set<TeamPermission> granted) {

    public RolePermissions {
        granted = role == TeamRole.OWNER
                ? EnumSet.allOf(TeamPermission.class)
                : (granted == null || granted.isEmpty()
                        ? EnumSet.noneOf(TeamPermission.class)
                        : EnumSet.copyOf(granted));
    }

    /** Quyền mặc định của vai trò (dùng trong test và khi team chưa chỉnh bảng quyền). */
    public static RolePermissions defaults(TeamRole role) {
        return new RolePermissions(role, TeamPermission.defaultsOf(role));
    }

    public boolean isOwner() {
        return role == TeamRole.OWNER;
    }

    public boolean has(TeamPermission permission) {
        return granted.contains(permission);
    }

    /**
     * Có được mời, đổi vai trò, xóa người mang vai trò {@code target} (hoặc gán {@code target} cho người khác) không: vai
     * trò chủ nhóm chỉ chủ nhóm; quản lý cần MANAGE_MANAGERS; người phối, người xem cần MANAGE_MEMBERS.
     */
    public boolean canAssign(TeamRole target) {
        if (target == null) {
            return false;
        }
        return switch (target) {
            case OWNER -> isOwner();
            case MANAGER -> has(TeamPermission.MANAGE_MANAGERS);
            case ARRANGER, VIEWER -> has(TeamPermission.MANAGE_MEMBERS);
        };
    }

    /** Có quyền mời / thu hồi lời mời với ít nhất một vai trò (xem được danh sách lời mời đang chờ). */
    public boolean canInvite() {
        return has(TeamPermission.MANAGE_MEMBERS) || has(TeamPermission.MANAGE_MANAGERS);
    }
}
