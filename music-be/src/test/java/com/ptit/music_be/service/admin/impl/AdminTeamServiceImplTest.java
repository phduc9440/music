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

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.TeamRole;
import com.ptit.music_be.dto.request.ShowRequest;
import com.ptit.music_be.dto.request.TeamInviteRequest;
import com.ptit.music_be.dto.request.TeamRequest;
import com.ptit.music_be.dto.response.AdminTeamDetailResponse;
import com.ptit.music_be.dto.response.AdminTeamResponse;
import com.ptit.music_be.dto.response.AdminTeamSummaryResponse;
import com.ptit.music_be.dto.response.TeamResponse;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
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

        var page = adminTeamService.search("kiểm thử zq", 0, 20);
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
        assertTrue(adminTeamService.search("ADMIN@music.com", 0, 50).getTotalElements() >= 1);

        AdminTeamDetailResponse detail = adminTeamService.detail(team.getId());
        assertEquals(2, detail.getMembers().size());
        assertEquals(1, detail.getShows().size());
        assertEquals(1, detail.getScores().size());
        assertEquals("PRIVATE", detail.getScores().get(0).getVisibility());
        assertTrue(detail.getRecentActivities().size() >= 4);
    }

    @Test
    void deleteNotifiesMembersAndReturnsScoresToOwners() {
        TeamResponse team = seedTeam("Team bị xóa");
        String scoreId = adminTeamService.detail(team.getId()).getScores().get(0).getId();

        adminTeamService.delete(team.getId(), "Nội dung vi phạm");
        em.flush();
        em.clear();

        assertEquals(
                ErrorCode.TEAM_NOT_EXISTED,
                assertThrows(AppException.class, () -> adminTeamService.detail(team.getId())).getErrorCode());
        assertNull(scoreRepository.findById(scoreId).orElseThrow().getTeamId());
        // Người xóa (chủ team ở đây) không tự nhận thông báo; thành viên còn lại nhận
        long notified = em.createQuery(
                        "select count(n) from Notification n where n.recipient.email = :e and n.type = :t", Long.class)
                .setParameter("e", MEMBER)
                .setParameter("t", NotificationType.TEAM_DELETED_BY_ADMIN)
                .getSingleResult();
        assertEquals(1, notified);
    }

    @Test
    void regularUserCannotUseAdminTeamApi() {
        as(MEMBER, "ROLE_USER");
        assertThrows(AccessDeniedException.class, () -> adminTeamService.summary());
    }
}
