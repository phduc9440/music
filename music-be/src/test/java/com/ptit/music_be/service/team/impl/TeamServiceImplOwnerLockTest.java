package com.ptit.music_be.service.team.impl;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Team;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.TeamErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.team.ShowItemRepository;
import com.ptit.music_be.repository.team.ShowRepository;
import com.ptit.music_be.repository.team.TeamMemberRepository;
import com.ptit.music_be.repository.team.TeamRepository;
import com.ptit.music_be.service.auth.EmailService;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.team.RolePermissions;
import com.ptit.music_be.service.team.TeamAccess;
import com.ptit.music_be.service.team.TeamActivityLog;
import com.ptit.music_be.service.team.TeamPermissionStore;

/**
 * Hai chủ nhóm hạ quyền / xóa nhau cùng lúc không được làm nhóm mất hết chủ: dòng team phải được khóa trước khi đếm số chủ
 * nhóm, để hai thao tác xếp hàng thay vì cùng thấy "còn 2 chủ".
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TeamServiceImplOwnerLockTest {

    static final String TEAM_ID = "team-1";

    @Mock
    TeamRepository teamRepository;

    @Mock
    TeamMemberRepository teamMemberRepository;

    @Mock
    TeamAccess access;

    TeamServiceImpl service;
    Member me;
    Member other;
    TeamMember mine;
    TeamMember target;

    @BeforeEach
    void setUp() {
        service = new TeamServiceImpl(
                teamRepository,
                teamMemberRepository,
                mock(com.ptit.music_be.repository.team.TeamInvitationRepository.class),
                mock(com.ptit.music_be.repository.team.TeamActivityRepository.class),
                mock(ShowRepository.class),
                mock(ShowItemRepository.class),
                mock(ScoreRepository.class),
                mock(MemberRepository.class),
                mock(EntitlementService.class),
                mock(NotificationService.class),
                mock(EmailService.class),
                access,
                mock(TeamActivityLog.class),
                mock(TeamPermissionStore.class),
                "http://localhost:5173");
        Team team = Team.builder().id(TEAM_ID).name("Nhóm").build();
        me = Member.builder().id("m1").email("a@x.com").build();
        other = Member.builder().id("m2").email("b@x.com").build();
        mine = TeamMember.builder()
                .id("tm1")
                .team(team)
                .member(me)
                .role(TeamRole.OWNER)
                .build();
        target = TeamMember.builder()
                .id("tm2")
                .team(team)
                .member(other)
                .role(TeamRole.OWNER)
                .build();
        when(access.currentMember()).thenReturn(me);
        when(access.membership(TEAM_ID, me)).thenReturn(mine);
        when(access.permissions(mine)).thenReturn(RolePermissions.defaults(TeamRole.OWNER));
        when(teamRepository.findByIdForUpdate(TEAM_ID)).thenReturn(Optional.of(team));
        when(teamMemberRepository.findByTeamIdAndMemberId(TEAM_ID, "m2")).thenReturn(Optional.of(target));
        when(teamMemberRepository.countByTeamIdAndRole(TEAM_ID, TeamRole.OWNER)).thenReturn(2L);
    }

    @Test
    void changeRoleLocksTeamBeforeCountingOwners() {
        service.changeRole(TEAM_ID, "m2", TeamRole.MANAGER);

        InOrder order = inOrder(teamRepository, teamMemberRepository);
        order.verify(teamRepository).findByIdForUpdate(TEAM_ID);
        order.verify(teamMemberRepository).countByTeamIdAndRole(TEAM_ID, TeamRole.OWNER);
    }

    @Test
    void removeMemberLocksTeamBeforeCountingOwners() {
        service.removeMember(TEAM_ID, "m2");

        InOrder order = inOrder(teamRepository, teamMemberRepository);
        order.verify(teamRepository).findByIdForUpdate(TEAM_ID);
        order.verify(teamMemberRepository).countByTeamIdAndRole(TEAM_ID, TeamRole.OWNER);
    }

    @Test
    void lastOwnerStillCannotBeDemoted() {
        when(teamMemberRepository.countByTeamIdAndRole(TEAM_ID, TeamRole.OWNER)).thenReturn(1L);

        assertThatThrownBy(() -> service.changeRole(TEAM_ID, "m2", TeamRole.MANAGER))
                .isInstanceOf(AppException.class)
                .extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(TeamErrorCode.TEAM_LAST_OWNER);
        verify(teamMemberRepository, never()).save(any());
    }
}
