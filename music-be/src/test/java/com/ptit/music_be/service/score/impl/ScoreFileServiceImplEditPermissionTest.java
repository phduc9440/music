package com.ptit.music_be.service.score.impl;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.permission.ScoreAccessAuditor;
import com.ptit.music_be.service.permission.impl.ScorePermissionServiceImpl;

/**
 * Quyền sửa / chia sẻ / xóa qua {@code ScoreFileServiceImpl}: USER, ADMIN và SUPER_ADMIN (SUPER_ADMIN trong token luôn
 * kèm ROLE_ADMIN). Bảng quyền đầy đủ nằm ở {@code ScorePermissionServiceImplTest}.
 */
class ScoreFileServiceImplEditPermissionTest {

    private final MemberScoreRepository shares = mock(MemberScoreRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final ScoreFileServiceImpl service = new ScoreFileServiceImpl(
            mock(ScoreRepository.class),
            mock(ScoreFileRepository.class),
            null,
            null,
            new ScorePermissionServiceImpl(
                    shares, members, (score, memberId) -> Optional.empty(), mock(ScoreAccessAuditor.class)));

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void loginAs(String email, String... authorities) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", authorities));
        when(shares.findByScoreIdAndMemberEmail(any(), any())).thenReturn(Optional.empty());
        when(members.findByEmail(any()))
                .thenReturn(Optional.of(Member.builder().id("m").build()));
    }

    private Score scoreOf(String ownerEmail, boolean official) {
        return scoreOf(ownerEmail, official, "PRIVATE");
    }

    private Score scoreOf(String ownerEmail, boolean official, String visibility) {
        return Score.builder()
                .id("s1")
                .member(Member.builder().email(ownerEmail).build())
                .isOfficial(official)
                .visibility(visibility)
                .build();
    }

    @Test
    void ownerCanEditOwnScore() {
        loginAs("a@x.com", "ROLE_USER");
        assertTrue(service.canEdit(scoreOf("a@x.com", false)));
    }

    @Test
    void plainAdminCannotEditSomeoneElsesScore() {
        loginAs("admin@x.com", "ROLE_ADMIN");
        assertFalse(service.canEdit(scoreOf("a@x.com", false)));
    }

    @Test
    void plainAdminCanEditOwnScoreAndOfficialScore() {
        loginAs("admin@x.com", "ROLE_ADMIN");
        assertTrue(service.canEdit(scoreOf("admin@x.com", false)));
        assertTrue(service.canEdit(scoreOf("a@x.com", true, "PUBLIC")));
    }

    @Test
    void superAdminCanOnlyEditOfficialScoresOfOthers() {
        loginAs("root@x.com", "ROLE_SUPER_ADMIN", "ROLE_ADMIN");
        assertFalse(service.canEdit(scoreOf("a@x.com", false)));
        assertFalse(service.canEdit(scoreOf("a@x.com", false, "PUBLIC")));
        assertTrue(service.canEdit(scoreOf("a@x.com", true, "PUBLIC")));
    }

    @Test
    void onlyOwnerCanManageSharing() {
        loginAs("admin@x.com", "ROLE_ADMIN");
        assertFalse(service.canManageSharing(scoreOf("a@x.com", false)));
        assertTrue(service.canManageSharing(scoreOf("admin@x.com", false)));
        loginAs("root@x.com", "ROLE_SUPER_ADMIN", "ROLE_ADMIN");
        assertFalse(service.canManageSharing(scoreOf("a@x.com", false)));
        loginAs("a@x.com", "ROLE_USER");
        assertTrue(service.canManageSharing(scoreOf("a@x.com", false)));
    }

    @Test
    void ownerOfOfficialScoreCannotEditIt() {
        loginAs("a@x.com", "ROLE_USER");
        assertFalse(service.canEdit(scoreOf("a@x.com", true, "PUBLIC")));
    }

    @Test
    void getAccessLevelNamesTheLevel() {
        loginAs("a@x.com", "ROLE_USER");
        org.junit.jupiter.api.Assertions.assertEquals("OWNER", service.getAccessLevel(scoreOf("a@x.com", false)));
        org.junit.jupiter.api.Assertions.assertEquals(
                "REVIEW", service.getAccessLevel(scoreOf("b@x.com", false, "PUBLIC")));
        org.junit.jupiter.api.Assertions.assertNull(service.getAccessLevel(scoreOf("b@x.com", false)));
        loginAs("admin@x.com", "ROLE_ADMIN");
        org.junit.jupiter.api.Assertions.assertEquals(
                "VIEW", service.getAccessLevel(scoreOf("b@x.com", false, "PENDING")));
    }
}
