package com.ptit.music_be.service.team;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.ScoreAccess;
import com.ptit.music_be.dto.enums.ShowItemStatus;
import com.ptit.music_be.dto.enums.TeamRole;
import com.ptit.music_be.dto.request.ShowItemRequest;
import com.ptit.music_be.dto.request.ShowItemStatusRequest;
import com.ptit.music_be.dto.request.ShowRequest;
import com.ptit.music_be.dto.request.TeamInviteRequest;
import com.ptit.music_be.dto.request.TeamRequest;
import com.ptit.music_be.dto.response.ShowDetailResponse;
import com.ptit.music_be.dto.response.ShowItemResponse;
import com.ptit.music_be.dto.response.TeamInvitationResponse;
import com.ptit.music_be.dto.response.TeamResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.service.auth.EmailService;
import com.ptit.music_be.service.permission.ScorePermissionService;

/**
 * Kịch bản "Xong khi" của mục 4.1 chạy với DB thật (cần MySQL; schema có các bảng team): 3 tài khoản trong một team, show
 * 5 bài, người phối sửa được đúng bài được giao còn bài khác chỉ nhận xét, người duyệt nhận thông báo khi có bài gửi duyệt.
 * Mỗi test chạy trong một transaction và được rollback.
 */
@SpringBootTest
@Transactional
class TeamShowFlowTest {

    static final String OWNER = "admin@music.com"; // SUPER_ADMIN: gói không giới hạn nên tạo được team
    static final String ARRANGER = "lan.nguyen@music.com";
    static final String REVIEWER = "minh.tran@music.com";

    @Autowired
    TeamService teamService;

    @Autowired
    ShowService showService;

    @Autowired
    ScorePermissionService permissionService;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    @PersistenceContext
    EntityManager em;

    /** Không gửi email thật cho các tài khoản mẫu. */
    @MockitoBean
    EmailService emailService;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static void as(String email, String... roles) {
        String[] authorities = roles.length == 0 ? new String[] {"ROLE_USER"} : roles;
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", authorities));
    }

    private static void asOwner() {
        as(OWNER, "ROLE_USER", "ROLE_ADMIN", "ROLE_SUPER_ADMIN");
    }

    private Member member(String email) {
        return memberRepository.findByEmail(email).orElseThrow();
    }

    private long notifications(String email, NotificationType type) {
        return em.createQuery(
                        "select count(n) from Notification n where n.recipient.email = :e and n.type = :t", Long.class)
                .setParameter("e", email)
                .setParameter("t", type)
                .getSingleResult();
    }

    private static ShowItemResponse itemOf(ShowDetailResponse d, String scoreId) {
        return d.getItems().stream().filter(i -> i.getScoreId().equals(scoreId)).findFirst().orElseThrow();
    }

    private static ErrorCode codeOf(Runnable action) {
        return assertThrows(AppException.class, action::run).getErrorCode();
    }

    @Test
    void teamOfThreeShowOfFiveArrangerEditsOnlyAssignedReviewerIsNotified() {
        // 1. Chủ team tạo team, mời một người bằng email và một người bằng link
        asOwner();
        TeamResponse team = teamService.create(new TeamRequest("Ban nhạc thử", "Demo 4.1"));
        assertEquals(TeamRole.OWNER, team.getMyRole());
        teamService.invite(team.getId(), new TeamInviteRequest(ARRANGER, TeamRole.ARRANGER));
        TeamInvitationResponse link = teamService.invite(team.getId(), new TeamInviteRequest(null, TeamRole.ARRANGER));
        assertNotNull(link.getToken());
        assertEquals(1, notifications(ARRANGER, NotificationType.TEAM_INVITED));

        // 2. Hai người chấp nhận: người được mời qua email thấy lời mời trong danh sách của mình, người kia dùng link
        as(ARRANGER);
        List<TeamInvitationResponse> mine = teamService.myInvitations();
        assertEquals(1, mine.size());
        teamService.acceptMine(mine.get(0).getId());
        as(REVIEWER);
        assertEquals("VALID", teamService.preview(link.getToken()).getState());
        teamService.accept(link.getToken());
        // Mã mời chỉ dùng một lần
        assertEquals(ErrorCode.TEAM_INVITATION_INVALID, codeOf(() -> teamService.accept(link.getToken())));

        asOwner();
        assertEquals(3, teamService.members(team.getId()).size());
        assertEquals(2, notifications(OWNER, NotificationType.TEAM_MEMBER_JOINED));

        // 3. Chủ team chuyển 5 bản nhạc của mình vào team, tạo show 5 bài
        Member owner = member(OWNER);
        List<String> scoreIds = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            Score s = scoreRepository.save(Score.builder()
                    .member(owner)
                    .title("Bài " + i)
                    .visibility("PRIVATE")
                    .build());
            teamService.addScore(team.getId(), s.getId());
            scoreIds.add(s.getId());
        }
        assertEquals(5, teamService.scores(team.getId()).size());
        String showId = showService
                .create(team.getId(), new ShowRequest("Đêm nhạc", null, "Nhà hát", null, null))
                .getId();
        String arrangerId = member(ARRANGER).getId();
        String reviewerId = member(REVIEWER).getId();
        ShowDetailResponse detail = null;
        for (int i = 0; i < 5; i++) {
            // Bài 1 giao cho người phối A, người duyệt B; các bài khác B phối
            String arr = i == 0 ? arrangerId : reviewerId;
            String rev = i == 0 ? reviewerId : null;
            detail = showService.addItem(showId, new ShowItemRequest(scoreIds.get(i), arr, rev, null, null));
        }
        assertEquals(5, detail.getItems().size());
        assertEquals(1, notifications(ARRANGER, NotificationType.SHOW_ITEM_ASSIGNED));

        // 4. Người phối: sửa được bài được giao, bài khác chỉ nhận xét
        as(ARRANGER);
        Score first = scoreRepository.findById(scoreIds.get(0)).orElseThrow();
        Score second = scoreRepository.findById(scoreIds.get(1)).orElseThrow();
        assertTrue(permissionService.canEdit(first));
        assertFalse(permissionService.canEdit(second));
        assertEquals(ScoreAccess.REVIEW, permissionService.resolve(second).level());
        assertFalse(permissionService.canDelete(second));

        // 5. Gửi duyệt: người duyệt nhận thông báo
        String itemId = itemOf(detail, scoreIds.get(0)).getId();
        showService.changeStatus(showId, itemId, new ShowItemStatusRequest(ShowItemStatus.ARRANGING, null));
        showService.changeStatus(showId, itemId, new ShowItemStatusRequest(ShowItemStatus.IN_REVIEW, null));
        assertEquals(1, notifications(REVIEWER, NotificationType.SHOW_ITEM_SUBMITTED));
        // Người phối không tự duyệt và không kéo được bài của người khác
        assertEquals(
                ErrorCode.SHOW_ITEM_TRANSITION_INVALID,
                codeOf(() -> showService.changeStatus(
                        showId, itemId, new ShowItemStatusRequest(ShowItemStatus.APPROVED, null))));
        String otherItem = itemOf(detail, scoreIds.get(1)).getId();
        assertEquals(
                ErrorCode.SHOW_ITEM_TRANSITION_INVALID,
                codeOf(() -> showService.changeStatus(
                        showId, otherItem, new ShowItemStatusRequest(ShowItemStatus.ARRANGING, null))));

        // 6. Người duyệt trả lại phải kèm góp ý; trả lại thì người phối được báo, gửi lại rồi duyệt
        as(REVIEWER);
        assertEquals(
                ErrorCode.SHOW_ITEM_NOTE_REQUIRED,
                codeOf(() -> showService.changeStatus(
                        showId, itemId, new ShowItemStatusRequest(ShowItemStatus.ARRANGING, " "))));
        ShowDetailResponse returned = showService.changeStatus(
                showId, itemId, new ShowItemStatusRequest(ShowItemStatus.ARRANGING, "Hạ tone xuống 1 cung"));
        assertEquals("Hạ tone xuống 1 cung", itemOf(returned, scoreIds.get(0)).getReviewNote());
        assertEquals(1, notifications(ARRANGER, NotificationType.SHOW_ITEM_RETURNED));
        as(ARRANGER);
        showService.changeStatus(showId, itemId, new ShowItemStatusRequest(ShowItemStatus.IN_REVIEW, null));
        as(REVIEWER);
        ShowDetailResponse approved =
                showService.changeStatus(showId, itemId, new ShowItemStatusRequest(ShowItemStatus.APPROVED, null));
        assertEquals(ShowItemStatus.APPROVED, itemOf(approved, scoreIds.get(0)).getStatus());
        assertEquals(1, approved.getShow().getApprovedCount());
        assertEquals(1, notifications(ARRANGER, NotificationType.SHOW_ITEM_APPROVED));

        // 7. Việc của tôi: B còn 4 bài phối chưa xong
        assertEquals(4, teamService.myTasks().size());

        // 8. Team luôn còn ít nhất một chủ; xóa người phối thì người đó mất quyền sửa
        asOwner();
        String ownerId = owner.getId();
        assertEquals(ErrorCode.TEAM_LAST_OWNER, codeOf(() -> teamService.removeMember(team.getId(), ownerId)));
        teamService.removeMember(team.getId(), arrangerId);
        em.flush();
        em.clear();
        as(ARRANGER);
        assertFalse(permissionService.canEdit(scoreRepository.findById(scoreIds.get(0)).orElseThrow()));
        assertEquals(ErrorCode.TEAM_NOT_EXISTED, codeOf(() -> teamService.get(team.getId())));
    }

    @Test
    void creatingTeamNeedsTeamPlanAndOnlyScoreOwnerMovesScoreIn() {
        // Tài khoản mẫu thường dùng gói Free (không có quyền lợi team)
        as(ARRANGER);
        assertEquals(
                ErrorCode.TEAM_PLAN_REQUIRED, codeOf(() -> teamService.create(new TeamRequest("Không được", null))));

        asOwner();
        TeamResponse team = teamService.create(new TeamRequest("Team B", null));
        TeamInvitationResponse link = teamService.invite(team.getId(), new TeamInviteRequest(null, TeamRole.MANAGER));
        as(REVIEWER);
        teamService.accept(link.getToken());
        // Bản của người khác: kể cả quản lý team cũng không chuyển vào được
        Score ownersScore = scoreRepository.save(Score.builder()
                .member(member(OWNER))
                .title("Bản của chủ team")
                .visibility("PRIVATE")
                .build());
        assertEquals(
                ErrorCode.TEAM_SCORE_NOT_OWNER,
                codeOf(() -> teamService.addScore(team.getId(), ownersScore.getId())));
        // MANAGER không cấp được vai trò OWNER
        String ownerId = member(OWNER).getId();
        assertEquals(
                ErrorCode.TEAM_FORBIDDEN,
                codeOf(() -> teamService.changeRole(team.getId(), ownerId, TeamRole.VIEWER)));
    }
}
