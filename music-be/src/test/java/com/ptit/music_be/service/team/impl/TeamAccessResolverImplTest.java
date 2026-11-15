package com.ptit.music_be.service.team.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.repository.team.ShowItemRepository;
import com.ptit.music_be.repository.team.TeamMemberRepository;
import com.ptit.music_be.service.team.RolePermissions;
import com.ptit.music_be.service.team.TeamPermissionStore;

/** Quyền qua team theo vai trò (ma trận 2.3 + mục 4.1). */
class TeamAccessResolverImplTest {

    private final TeamMemberRepository members = mock(TeamMemberRepository.class);
    private final ShowItemRepository items = mock(ShowItemRepository.class);
    private final TeamPermissionStore store = mock(TeamPermissionStore.class);
    private final TeamAccessResolverImpl resolver = new TeamAccessResolverImpl(members, items, store);

    private static Score score(String teamId) {
        return Score.builder().id("s1").teamId(teamId).build();
    }

    @Test
    void personalScoreGivesNothingAndSkipsLookups() {
        assertTrue(resolver.resolve(score(null), "m1").isEmpty());
        verifyNoInteractions(members, items, store);
    }

    @Test
    void outsiderOfTheTeamGetsNothing() {
        when(members.findByTeamIdAndMemberId("t1", "m1")).thenReturn(Optional.empty());
        assertTrue(resolver.resolve(score("t1"), "m1").isEmpty());
    }

    @ParameterizedTest(name = "{0} (quyền mặc định), được giao phối = {1} -> {2}")
    @CsvSource({
        "OWNER, false, OWNER",
        "MANAGER, false, EDIT",
        "MANAGER, true, EDIT",
        "ARRANGER, true, EDIT",
        "ARRANGER, false, REVIEW",
        "VIEWER, false, VIEW",
        "VIEWER, true, VIEW",
    })
    void levelFollowsRoleAndAssignment(TeamRole role, boolean assigned, ScoreAccess expected) {
        when(members.findByTeamIdAndMemberId("t1", "m1"))
                .thenReturn(Optional.of(TeamMember.builder().role(role).build()));
        when(store.of("t1", role)).thenReturn(RolePermissions.defaults(role));
        when(items.isArrangerOf("s1", "m1", "t1")).thenReturn(assigned);
        assertEquals(Optional.of(expected), resolver.resolve(score("t1"), "m1"));
    }

    @ParameterizedTest(name = "{0} với quyền [{1}], được giao phối = {2} -> {3}")
    @CsvSource({
        // chủ nhóm tích "Xóa, công khai, chia sẻ bản của người khác" cho quản lý
        "MANAGER, MANAGE_SCORES EDIT_SCORES COMMENT, false, OWNER",
        // bỏ tích "Sửa bản nhạc của nhóm": quản lý chỉ sửa bài mình được giao
        "MANAGER, COMMENT, false, REVIEW",
        "MANAGER, COMMENT, true, EDIT",
        // cho người xem góp ý
        "VIEWER, COMMENT, false, REVIEW",
        // bỏ quyền góp ý của người phối
        "ARRANGER, '', false, VIEW",
    })
    void levelFollowsTeamPermissionTable(TeamRole role, String perms, boolean assigned, ScoreAccess expected) {
        java.util.Set<TeamPermission> granted = java.util.EnumSet.noneOf(TeamPermission.class);
        for (String p : perms.isBlank() ? new String[0] : perms.split(" ")) {
            granted.add(TeamPermission.valueOf(p));
        }
        when(members.findByTeamIdAndMemberId("t1", "m1"))
                .thenReturn(Optional.of(TeamMember.builder().role(role).build()));
        when(store.of("t1", role)).thenReturn(new RolePermissions(role, granted));
        when(items.isArrangerOf("s1", "m1", "t1")).thenReturn(assigned);
        assertEquals(Optional.of(expected), resolver.resolve(score("t1"), "m1"));
    }
}
