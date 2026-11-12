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

import com.ptit.music_be.dto.enums.ScoreAccess;
import com.ptit.music_be.dto.enums.TeamRole;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.repository.ShowItemRepository;
import com.ptit.music_be.repository.TeamMemberRepository;

/** Quyền qua team theo vai trò (ma trận 2.3 + mục 4.1). */
class TeamAccessResolverImplTest {

    private final TeamMemberRepository members = mock(TeamMemberRepository.class);
    private final ShowItemRepository items = mock(ShowItemRepository.class);
    private final TeamAccessResolverImpl resolver = new TeamAccessResolverImpl(members, items);

    private static Score score(String teamId) {
        return Score.builder().id("s1").teamId(teamId).build();
    }

    @Test
    void personalScoreGivesNothingAndSkipsLookups() {
        assertTrue(resolver.resolve(score(null), "m1").isEmpty());
        verifyNoInteractions(members, items);
    }

    @Test
    void outsiderOfTheTeamGetsNothing() {
        when(members.findByTeamIdAndMemberId("t1", "m1")).thenReturn(Optional.empty());
        assertTrue(resolver.resolve(score("t1"), "m1").isEmpty());
    }

    @ParameterizedTest(name = "{0}, được giao phối = {1} -> {2}")
    @CsvSource({
        "OWNER, false, OWNER",
        "MANAGER, false, OWNER",
        "ARRANGER, true, EDIT",
        "ARRANGER, false, REVIEW",
        "VIEWER, false, VIEW",
        "VIEWER, true, VIEW",
    })
    void levelFollowsRoleAndAssignment(TeamRole role, boolean assigned, ScoreAccess expected) {
        when(members.findByTeamIdAndMemberId("t1", "m1"))
                .thenReturn(Optional.of(TeamMember.builder().role(role).build()));
        when(items.isArrangerOf("s1", "m1", "t1")).thenReturn(assigned);
        assertEquals(Optional.of(expected), resolver.resolve(score("t1"), "m1"));
    }
}
