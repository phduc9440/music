package com.ptit.music_be.service.permission;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.ScoreAccess;
import com.ptit.music_be.dto.enums.SharePermission;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.service.permission.impl.ScorePermissionServiceImpl;

/** Bảng quyết định quyền: mỗi dòng là (vai trò, visibility, kho mẫu, chia sẻ/team) → mức truy cập mong đợi. */
class ScorePermissionServiceImplTest {

    private static final String OWNER = "owner@x.com";
    private static final String USER = "user@x.com";
    private static final String ADMIN = "admin@x.com";
    private static final String ROOT = "root@x.com";

    private final MemberScoreRepository shares = mock(MemberScoreRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final TeamAccessResolver team = mock(TeamAccessResolver.class);
    private final ScoreAccessAuditor auditor = mock(ScoreAccessAuditor.class);
    private final ScorePermissionServiceImpl service = new ScorePermissionServiceImpl(shares, members, team, auditor);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void loginAs(String email) {
        String[] authorities =
                switch (email) {
                    case ADMIN -> new String[] {"ROLE_ADMIN"};
                    case ROOT -> new String[] {"ROLE_SUPER_ADMIN", "ROLE_ADMIN"};
                    default -> new String[] {"ROLE_USER"};
                };
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", authorities));
        when(members.findByEmail(email))
                .thenReturn(Optional.of(Member.builder().id("m-" + email).build()));
    }

    private static Score score(String visibility, boolean official) {
        return Score.builder()
                .id("s1")
                .member(Member.builder().id("m-" + OWNER).email(OWNER).build())
                .visibility(visibility)
                .isOfficial(official)
                .build();
    }

    private void share(String email, SharePermission permission) {
        MemberScore ms = MemberScore.builder().permission(permission).build();
        when(shares.findByScoreIdAndMemberEmail("s1", email)).thenReturn(Optional.of(ms));
    }

    static Stream<Arguments> matrix() {
        // email, visibility, official, quyền được chia sẻ (null = không), mức mong đợi, moderator mong đợi
        return Stream.of(
                // chủ sở hữu luôn là OWNER
                Arguments.of(OWNER, "PRIVATE", false, null, ScoreAccess.OWNER, false),
                Arguments.of(OWNER, "PUBLIC", true, null, ScoreAccess.OWNER, false),
                // người lạ
                Arguments.of(USER, "PRIVATE", false, null, ScoreAccess.NONE, false),
                Arguments.of(USER, "PENDING", false, null, ScoreAccess.NONE, false),
                Arguments.of(USER, "PUBLIC", false, null, ScoreAccess.REVIEW, false),
                // được chia sẻ
                Arguments.of(USER, "PRIVATE", false, SharePermission.VIEW, ScoreAccess.VIEW, false),
                Arguments.of(USER, "PRIVATE", false, SharePermission.REVIEW, ScoreAccess.REVIEW, false),
                Arguments.of(USER, "PRIVATE", false, SharePermission.EDIT, ScoreAccess.EDIT, false),
                // bản công khai: quyền chia sẻ cao hơn REVIEW thì giữ, thấp hơn thì lên REVIEW
                Arguments.of(USER, "PUBLIC", false, SharePermission.VIEW, ScoreAccess.REVIEW, false),
                Arguments.of(USER, "PUBLIC", false, SharePermission.EDIT, ScoreAccess.EDIT, false),
                // bản kho mẫu: người dùng thường chỉ nhận xét
                Arguments.of(USER, "PUBLIC", true, null, ScoreAccess.REVIEW, false),
                // ADMIN: bản riêng tư của người khác thì không thấy (P2)
                Arguments.of(ADMIN, "PRIVATE", false, null, ScoreAccess.NONE, false),
                // ADMIN kiểm duyệt bản chờ duyệt: chỉ xem
                Arguments.of(ADMIN, "PENDING", false, null, ScoreAccess.VIEW, true),
                // ADMIN với bản công khai: như người dùng thường, không sửa được
                Arguments.of(ADMIN, "PUBLIC", false, null, ScoreAccess.REVIEW, false),
                // ADMIN sửa được bản kho mẫu
                Arguments.of(ADMIN, "PUBLIC", true, null, ScoreAccess.EDIT, false),
                // ADMIN được chia sẻ EDIT thì sửa như người dùng thường, không phải kiểm duyệt
                Arguments.of(ADMIN, "PRIVATE", false, SharePermission.EDIT, ScoreAccess.EDIT, false),
                // SUPER_ADMIN không hơn ADMIN (P5)
                Arguments.of(ROOT, "PRIVATE", false, null, ScoreAccess.NONE, false),
                Arguments.of(ROOT, "PENDING", false, null, ScoreAccess.VIEW, true),
                Arguments.of(ROOT, "PUBLIC", false, null, ScoreAccess.REVIEW, false),
                Arguments.of(ROOT, "PUBLIC", true, null, ScoreAccess.EDIT, false));
    }

    @ParameterizedTest(name = "{0} / {1} / kho mẫu={2} / chia sẻ={3} → {4}")
    @MethodSource("matrix")
    void resolvesAccessLevel(
            String email,
            String visibility,
            boolean official,
            SharePermission shared,
            ScoreAccess expected,
            boolean expectedModerator) {
        loginAs(email);
        if (shared != null) {
            share(email, shared);
        }

        AccessDecision decision = service.resolve(score(visibility, official));

        assertEquals(expected, decision.level());
        assertEquals(expectedModerator, decision.moderator());
        assertEquals(ROOT.equals(email), decision.superAdmin());
    }

    @Test
    void shareRowWithoutPermissionIsOnlyARequest() {
        loginAs(USER);
        when(shares.findByScoreIdAndMemberEmail("s1", USER))
                .thenReturn(Optional.of(MemberScore.builder().permission(null).build()));

        assertEquals(ScoreAccess.NONE, service.resolve(score("PRIVATE", false)).level());
    }

    @Test
    void teamAccessIsUsedWhenHigherThanShare() {
        loginAs(USER);
        share(USER, SharePermission.VIEW);
        when(team.resolve(any(Score.class), eq("m-" + USER))).thenReturn(Optional.of(ScoreAccess.EDIT));

        assertEquals(ScoreAccess.EDIT, service.resolve(score("PRIVATE", false)).level());
    }

    @Test
    void scoreWithoutOwnerIsNotOwnedByAnyone() {
        loginAs(USER);
        Score ownerless =
                Score.builder().id("s1").visibility("PUBLIC").isOfficial(true).build();

        assertEquals(ScoreAccess.REVIEW, service.resolve(ownerless).level());
    }

    @Test
    void officialScoreCanOnlyBeEditedByAdmin() {
        Score official = score("PUBLIC", true);

        loginAs(OWNER);
        assertFalse(service.canEdit(official));
        assertTrue(service.canEdit(score("PRIVATE", false)));

        loginAs(USER);
        share(USER, SharePermission.EDIT);
        assertFalse(service.canEdit(official));

        loginAs(ADMIN);
        assertTrue(service.canEdit(official));
        loginAs(ROOT);
        assertTrue(service.canEdit(official));
    }

    @Test
    void ownerAndModeratorCanDelete() {
        loginAs(OWNER);
        Score own = score("PRIVATE", false);
        assertTrue(service.canDelete(own));

        loginAs(ADMIN);
        assertTrue(service.canDelete(score("PUBLIC", false)));
        assertTrue(service.canDelete(score("PENDING", false)));
    }

    @Test
    void adminCannotDeletePrivateScoreOfSomeoneElse() {
        loginAs(ADMIN);
        assertFalse(service.canDelete(score("PRIVATE", false)));
        loginAs(ROOT);
        assertFalse(service.canDelete(score("PRIVATE", false)));
    }

    @Test
    void sharedEditorAndPlainUserCannotDelete() {
        loginAs(USER);
        share(USER, SharePermission.EDIT);
        assertFalse(service.canDelete(score("PRIVATE", false)));
        assertFalse(service.canDelete(score("PUBLIC", false)));
    }

    @Test
    void auditorIsCalledOnlyForAdminOnSomeoneElsesScore() {
        loginAs(ADMIN);
        Score others = score("PENDING", false);
        service.auditModeratorAccess(others, "VIEW");
        verify(auditor).onModeratorAccess(others, ADMIN, "VIEW");

        loginAs(USER);
        service.auditModeratorAccess(others, "VIEW");
        loginAs(OWNER);
        service.auditModeratorAccess(others, "VIEW");
        verify(auditor, never()).onModeratorAccess(any(), eq(USER), any());
        verify(auditor, never()).onModeratorAccess(any(), eq(OWNER), any());
    }
}
