package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.dto.request.team.ShowRequest;
import com.ptit.music_be.dto.request.team.TeamInviteRequest;
import com.ptit.music_be.dto.request.team.TeamRequest;
import com.ptit.music_be.dto.response.admin.AdminTeamDetailResponse;
import com.ptit.music_be.dto.response.admin.AdminTeamResponse;
import com.ptit.music_be.dto.response.admin.AdminTeamSummaryResponse;
import com.ptit.music_be.dto.response.team.TeamResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.admin.AdminTeamService;
import com.ptit.music_be.service.auth.EmailService;
import com.ptit.music_be.service.team.ShowService;
import com.ptit.music_be.service.team.TeamService;

/** Quản lý team của admin với DB thật (cần MySQL có các bảng team). Mỗi test rollback. */
@SpringBootTest
@Transactional
class AdminTeamServiceImplTest {

    static final String OWNER = "admin@music.com";
    static final String MEMBER = "lan.nguyen@music.com";

    @Autowired
    AdminTeamService adminTeamService;

    @Autowired
    TeamService teamService;

    @Autowired
    ShowService showService;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    @PersistenceContext
    EntityManager em;

    @MockitoBean
    EmailService emailService;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static void as(String email, String... roles) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", roles));
    }

    private static void asSuperAdmin() {
        as(OWNER, "ROLE_USER", "ROLE_ADMIN", "ROLE_SUPER_ADMIN");
    }

    /** Team 2 người, 1 bản nhạc, 1 show đang chuẩn bị. */
    private TeamResponse seedTeam(String name) {
        asSuperAdmin();
        TeamResponse team = teamService.create(new TeamRequest(name, "Team của test admin"));
        String token = teamService.invite(team.getId(), new TeamInviteRequest(null, TeamRole.ARRANGER)).getToken();
        as(MEMBER, "ROLE_USER");
        teamService.accept(token);
        asSuperAdmin();
        Score score = scoreRepository.save(Score.builder()
                .member(memberRepository.findByEmail(OWNER).orElseThrow())
                .title("Bài của " + name)
                .visibility("PRIVATE")
                .build());
        teamService.addScore(team.getId(), score.getId());
        showService.create(team.getId(), new ShowRequest("Show của " + name, null, null, null, null));
        return team;
    }

    @Test
    void summarySearchAndDetailCountFromTeamTables() {
        asSuperAdmin();
        AdminTeamSummaryResponse before = adminTeamService.summary();
        TeamResponse team = seedTeam("Ban nhạc kiểm thử zq");

        AdminTeamSummaryResponse after = adminTeamService.summary();
        assertEquals(before.getTeams() + 1, after.getTeams());
        assertTrue(after.getActiveTeams7d() >= 1);
        assertEquals(before.getPreparingShows() + 1, after.getPreparingShows());

        var page = adminTeamService.search("kiểm thử zq", false, 0, 20);
        assertEquals(1, page.getTotalElements());
        AdminTeamResponse row = page.getContent().get(0);
        assertEquals(team.getId(), row.getId());
        assertEquals(2, row.getMemberCount());
        assertEquals(1, row.getScoreCount());
        assertEquals(1, row.getShowCount());
        assertEquals(1, row.getPreparingShows());
        assertEquals(OWNER, row.getCreatorEmail());
        assertTrue(row.isPlanActive());
        assertTrue(row.getLastActivityAt() != null);
        // Tìm theo email người tạo cũng ra
        assertTrue(adminTeamService.search("ADMIN@music.com", false, 0, 50).getTotalElements() >= 1);

        AdminTeamDetailResponse detail = adminTeamService.detail(team.getId());
        assertEquals(2, detail.getMembers().size());
        assertEquals(1, detail.getShows().size());
        assertEquals(1, detail.getScores().size());
        assertEquals("PRIVATE", detail.getScores().get(0).getVisibility());
        assertTrue(detail.getRecentActivities().size() >= 4);
    }

    @Test
    void deleteIsSoftHidesTeamFromMembersAndRestoreBringsEverythingBack() {
        TeamResponse team = seedTeam("Team bị xóa");
        String scoreId = adminTeamService.detail(team.getId()).getScores().get(0).getId();

        adminTeamService.delete(team.getId(), "Nội dung vi phạm");
        em.flush();
        em.clear();

        // Dữ liệu còn nguyên trong DB (không xóa cứng), chỉ đánh dấu xóa
        assertEquals(1L, em.createQuery("select count(t) from Team t where t.id = :id and t.deletedAt is not null", Long.class)
                .setParameter("id", team.getId()).getSingleResult());
        assertEquals(2L, em.createQuery("select count(m) from TeamMember m where m.team.id = :id and m.kind = 'MEMBER'", Long.class)
                .setParameter("id", team.getId()).getSingleResult());
        assertEquals(team.getId(), scoreRepository.findById(scoreId).orElseThrow().getTeamId());

        // Thành viên không còn vào được; team nằm trong danh sách đã xóa của admin, không còn trong danh sách đang hoạt động
        as(MEMBER, "ROLE_USER");
        assertEquals(
                ErrorCode.TEAM_NOT_EXISTED,
                assertThrows(AppException.class, () -> teamService.get(team.getId())).getErrorCode());
        assertTrue(teamService.myTeams().stream().noneMatch(t -> t.getId().equals(team.getId())));
        asSuperAdmin();
        assertEquals(0, adminTeamService.search("Team bị xóa", false, 0, 20).getTotalElements());
        AdminTeamResponse deleted = adminTeamService.search("Team bị xóa", true, 0, 20).getContent().get(0);
        assertTrue(deleted.isRestorable());
        assertTrue(deleted.isDeletedByAdmin());
        assertEquals("Nội dung vi phạm", deleted.getDeletedReason());

        // Người xóa (chủ team ở đây) không tự nhận thông báo; thành viên còn lại nhận
        long notified = em.createQuery(
                        "select count(n) from Notification n where n.recipient.email = :e and n.type = :t", Long.class)
                .setParameter("e", MEMBER)
                .setParameter("t", NotificationType.TEAM_DELETED_BY_ADMIN)
                .getSingleResult();
        assertEquals(1, notified);

        // Chủ team không tự khôi phục được team do quản trị viên xóa
        assertEquals(
                ErrorCode.TEAM_RESTORE_BY_ADMIN_ONLY,
                assertThrows(AppException.class, () -> teamService.restore(team.getId())).getErrorCode());

        adminTeamService.restore(team.getId());
        em.flush();
        em.clear();
        as(MEMBER, "ROLE_USER");
        assertEquals(team.getId(), teamService.get(team.getId()).getId());
        assertEquals(1, showService.shows(team.getId()).size());
        assertEquals(1, teamService.scores(team.getId()).size());
    }

    @Test
    void restoreFailsAfter30Days() {
        TeamResponse team = seedTeam("Team quá hạn");
        adminTeamService.delete(team.getId(), null);
        em.flush();
        em.createQuery("update Team t set t.deletedAt = :d where t.id = :id")
                .setParameter("d", java.time.LocalDateTime.now().minusDays(31))
                .setParameter("id", team.getId())
                .executeUpdate();
        em.clear();
        assertEquals(
                ErrorCode.TEAM_RESTORE_EXPIRED,
                assertThrows(AppException.class, () -> adminTeamService.restore(team.getId())).getErrorCode());
        // Quá hạn thì không xóa cứng: dòng vẫn còn, chỉ không khôi phục được
        assertTrue(adminTeamService.search("Team quá hạn", true, 0, 20).getContent().get(0).getDeletedAt() != null);
    }

    @Test
    void regularUserCannotUseAdminTeamApi() {
        as(MEMBER, "ROLE_USER");
        assertThrows(AccessDeniedException.class, () -> adminTeamService.summary());
    }
}
