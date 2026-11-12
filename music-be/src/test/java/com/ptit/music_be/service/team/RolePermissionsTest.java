package com.ptit.music_be.service.team;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;

/** Ai được mời / đổi vai trò / xóa người mang vai trò nào, theo bảng quyền mặc định và khi chủ nhóm chỉnh. */
class RolePermissionsTest {

    private static Set<TeamRole> assignable(RolePermissions perms) {
        return Arrays.stream(TeamRole.values()).filter(perms::canAssign).collect(Collectors.toSet());
    }

    @ParameterizedTest(name = "{0} (mặc định) quản lý được: {1}")
    @CsvSource({
        "OWNER, OWNER MANAGER ARRANGER VIEWER",
        "MANAGER, ARRANGER VIEWER",
        "ARRANGER, ''",
        "VIEWER, ''",
    })
    void canAssignWithDefaults(TeamRole actor, String expected) {
        Set<TeamRole> want = expected.isBlank()
                ? EnumSet.noneOf(TeamRole.class)
                : Arrays.stream(expected.split(" ")).map(TeamRole::valueOf).collect(Collectors.toSet());
        assertEquals(want, assignable(RolePermissions.defaults(actor)));
    }

    @Test
    void ownerAlwaysHasEverythingEvenIfTableSaysOtherwise() {
        RolePermissions owner = new RolePermissions(TeamRole.OWNER, EnumSet.noneOf(TeamPermission.class));
        for (TeamPermission p : TeamPermission.values()) {
            assertTrue(owner.has(p));
        }
    }

    @Test
    void ownerRoleStaysOwnerOnlyEvenWhenManagerCanManageManagers() {
        RolePermissions manager = new RolePermissions(
                TeamRole.MANAGER, EnumSet.of(TeamPermission.MANAGE_MANAGERS, TeamPermission.MANAGE_MEMBERS));
        assertEquals(EnumSet.of(TeamRole.MANAGER, TeamRole.ARRANGER, TeamRole.VIEWER), assignable(manager));
        assertFalse(manager.canAssign(null));
    }

    @Test
    void tickingAPermissionAlsoTicksWhatItNeeds() {
        assertEquals(
                EnumSet.of(TeamPermission.MANAGE_SCORES, TeamPermission.EDIT_SCORES, TeamPermission.COMMENT),
                TeamPermission.withRequired(EnumSet.of(TeamPermission.MANAGE_SCORES)));
        assertEquals(
                EnumSet.of(TeamPermission.MANAGE_MANAGERS, TeamPermission.MANAGE_MEMBERS),
                TeamPermission.withRequired(EnumSet.of(TeamPermission.MANAGE_MANAGERS)));
    }
}
