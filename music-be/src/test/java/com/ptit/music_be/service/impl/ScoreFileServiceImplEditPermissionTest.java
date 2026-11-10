package com.ptit.music_be.service.impl;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.repository.ScoreFileRepository;
import com.ptit.music_be.repository.ScoreRepository;

/** Quyền sửa bản nhạc: USER, ADMIN và SUPER_ADMIN (SUPER_ADMIN trong token luôn kèm ROLE_ADMIN). */
class ScoreFileServiceImplEditPermissionTest {

    private final MemberScoreRepository shares = mock(MemberScoreRepository.class);
    private final ScoreFileServiceImpl service =
            new ScoreFileServiceImpl(mock(ScoreRepository.class), shares, mock(ScoreFileRepository.class), null, null);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void loginAs(String email, String... authorities) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", authorities));
        org.mockito.Mockito.when(shares.findByScoreIdAndMemberEmail(
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(Optional.empty());
    }

    private Score scoreOf(String ownerEmail, boolean official) {
        return Score.builder()
                .id("s1")
                .member(Member.builder().email(ownerEmail).build())
                .isOfficial(official)
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
        assertTrue(service.canEdit(scoreOf("a@x.com", true)));
    }

    @Test
    void superAdminCanEditAnyScore() {
        loginAs("root@x.com", "ROLE_SUPER_ADMIN", "ROLE_ADMIN");
        assertTrue(service.canEdit(scoreOf("a@x.com", false)));
        assertTrue(service.canEdit(scoreOf("a@x.com", true)));
    }

    @Test
    void onlyOwnerAndSuperAdminCanManageSharing() {
        loginAs("admin@x.com", "ROLE_ADMIN");
        assertFalse(service.canManageSharing(scoreOf("a@x.com", false)));
        assertTrue(service.canManageSharing(scoreOf("admin@x.com", false)));
        loginAs("root@x.com", "ROLE_SUPER_ADMIN", "ROLE_ADMIN");
        assertTrue(service.canManageSharing(scoreOf("a@x.com", false)));
        loginAs("a@x.com", "ROLE_USER");
        assertTrue(service.canManageSharing(scoreOf("a@x.com", false)));
    }

    @Test
    void ownerOfOfficialScoreCannotEditIt() {
        loginAs("a@x.com", "ROLE_USER");
        assertFalse(service.canEdit(scoreOf("a@x.com", true)));
    }
}
