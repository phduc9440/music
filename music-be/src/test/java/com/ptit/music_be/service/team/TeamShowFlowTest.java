package com.ptit.music_be.service.team;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

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

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.enums.score.ScoreAccess;
import com.ptit.music_be.dto.enums.team.ShowItemStatus;
import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.dto.request.team.ShowItemRequest;
import com.ptit.music_be.dto.request.team.ShowItemStatusRequest;
import com.ptit.music_be.dto.request.team.ShowRequest;
import com.ptit.music_be.dto.request.team.TeamInviteRequest;
import com.ptit.music_be.dto.request.team.TeamPermissionsRequest;
import com.ptit.music_be.dto.request.team.TeamRequest;
import com.ptit.music_be.dto.response.team.ShowDetailResponse;
import com.ptit.music_be.dto.response.team.ShowItemResponse;
import com.ptit.music_be.dto.response.team.TeamInvitationResponse;
import com.ptit.music_be.dto.response.team.TeamPermissionsResponse;
import com.ptit.music_be.dto.response.team.TeamResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
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

    @Autowired
    com.ptit.music_be.repository.team.TeamMemberRepository teamMemberRepository;

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
        return d.getItems().stream()
                .filter(i -> i.getScoreId().equals(scoreId))
                .findFirst()
                .orElseThrow();
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
        // Thành viên, lời mời và nhật ký chung bảng team_members: truy vấn của từng loại chỉ thấy dòng của kind đó
        em.flush();
        assertEquals(3, teamMemberRepository.countByTeamId(team.getId()));
        assertEquals(
                3L,
                ((Number) em.createNativeQuery(
                                        "select count(*) from team_members where team_id = ?1 and kind = 'MEMBER'")
                                .setParameter(1, team.getId())
                                .getSingleResult())
                        .longValue());
        assertEquals(
                2L,
                ((Number) em.createNativeQuery(
                                        "select count(*) from team_members where team_id = ?1 and kind = 'INVITATION'")
                                .setParameter(1, team.getId())
                                .getSingleResult())
                        .longValue());
        assertTrue(teamMemberRepository
                        .findActivities(team.getId(), org.springframework.data.domain.PageRequest.of(0, 50))
                        .getTotalElements()
                > 0);

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
        assertFalse(permissionService.canEdit(
                scoreRepository.findById(scoreIds.get(0)).orElseThrow()));
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
                ErrorCode.TEAM_SCORE_NOT_OWNER, codeOf(() -> teamService.addScore(team.getId(), ownersScore.getId())));
        // MANAGER không đụng tới OWNER
        String ownerId = member(OWNER).getId();
        assertEquals(
                ErrorCode.TEAM_ROLE_SCOPE,
                codeOf(() -> teamService.changeRole(team.getId(), ownerId, TeamRole.VIEWER)));

        // Chỉ chủ team xóa được team; xóa xong thì không còn ai vào được
        assertEquals(ErrorCode.TEAM_OWNER_ONLY, codeOf(() -> teamService.delete(team.getId())));
        asOwner();
        teamService.delete(team.getId());
        em.flush();
        em.clear();
        assertEquals(ErrorCode.TEAM_NOT_EXISTED, codeOf(() -> teamService.get(team.getId())));
        // Xóa mềm: chủ team thấy trong danh sách đã xóa và khôi phục được
        assertEquals(1, teamService.deletedTeams().size());
        assertEquals(team.getId(), teamService.restore(team.getId()).getId());
        assertEquals(team.getId(), teamService.get(team.getId()).getId());
        assertTrue(teamService.deletedTeams().isEmpty());
    }

    @Test
    void managerCoordinatesWorkButOwnerKeepsTeamManagersAndOthersScores() {
        asOwner();
        TeamResponse team = teamService.create(new TeamRequest("Team C", null));
        String teamId = team.getId();
        TeamInvitationResponse managerLink = teamService.invite(teamId, new TeamInviteRequest(null, TeamRole.MANAGER));
        TeamInvitationResponse arrangerLink =
                teamService.invite(teamId, new TeamInviteRequest(null, TeamRole.ARRANGER));
        Score ownersScore = scoreRepository.save(Score.builder()
                .member(member(OWNER))
                .title("Bản của chủ nhóm")
                .visibility("PRIVATE")
                .build());
        teamService.addScore(teamId, ownersScore.getId());
        as(REVIEWER);
        teamService.accept(managerLink.getToken());
        as(ARRANGER);
        teamService.accept(arrangerLink.getToken());
        String ownerId = member(OWNER).getId();
        String managerId = member(REVIEWER).getId();
        String arrangerId = member(ARRANGER).getId();

        as(REVIEWER);
        // Việc điều phối: tạo buổi diễn, thêm bài, phân công, mời và đổi vai trò người phối / người xem
        String showId = showService
                .create(teamId, new ShowRequest("Tập dượt", null, null, null, null))
                .getId();
        showService.addItem(showId, new ShowItemRequest(ownersScore.getId(), arrangerId, managerId, null, null));
        assertNotNull(teamService
                .invite(teamId, new TeamInviteRequest(null, TeamRole.VIEWER))
                .getToken());
        assertEquals(
                TeamRole.VIEWER,
                teamService.changeRole(teamId, arrangerId, TeamRole.VIEWER).getRole());
        assertEquals(
                TeamRole.ARRANGER,
                teamService.changeRole(teamId, arrangerId, TeamRole.ARRANGER).getRole());

        // Việc của chủ nhóm (mặc định): sửa thông tin nhóm, tạo thêm quản lý, đụng tới chủ nhóm, chỉnh bảng quyền
        assertEquals(
                ErrorCode.TEAM_FORBIDDEN, codeOf(() -> teamService.update(teamId, new TeamRequest("Đổi tên", null))));
        assertEquals(
                ErrorCode.TEAM_OWNER_ONLY,
                codeOf(() -> teamService.updatePermissions(teamId, new TeamPermissionsRequest(Map.of()))));
        assertEquals(
                ErrorCode.TEAM_ROLE_SCOPE,
                codeOf(() -> teamService.invite(teamId, new TeamInviteRequest(null, TeamRole.MANAGER))));
        assertEquals(
                ErrorCode.TEAM_ROLE_SCOPE, codeOf(() -> teamService.changeRole(teamId, arrangerId, TeamRole.MANAGER)));
        assertEquals(ErrorCode.TEAM_ROLE_SCOPE, codeOf(() -> teamService.removeMember(teamId, ownerId)));

        // Bản nhạc của người khác trong team: quản lý sửa được nhưng không xóa, không chia sẻ / công khai
        Score score = scoreRepository.findById(ownersScore.getId()).orElseThrow();
        assertEquals(ScoreAccess.EDIT, permissionService.resolve(score).level());
        assertTrue(permissionService.canEdit(score));
        assertFalse(permissionService.canDelete(score));

        // Lời mời làm quản lý chỉ chủ nhóm thu hồi
        asOwner();
        TeamInvitationResponse secondManager =
                teamService.invite(teamId, new TeamInviteRequest(null, TeamRole.MANAGER));
        as(REVIEWER);
        assertEquals(
                ErrorCode.TEAM_ROLE_SCOPE, codeOf(() -> teamService.revokeInvitation(teamId, secondManager.getId())));

        // Chủ nhóm làm được hết: đổi tên, hạ quản lý xuống người phối, thu hồi lời mời quản lý
        asOwner();
        assertEquals(
                "Team C mới",
                teamService.update(teamId, new TeamRequest("Team C mới", null)).getName());
        teamService.revokeInvitation(teamId, secondManager.getId());
        assertEquals(
                TeamRole.ARRANGER,
                teamService.changeRole(teamId, managerId, TeamRole.ARRANGER).getRole());
        em.flush();
        em.clear();
        // Hết là quản lý thì không tạo buổi diễn được nữa
        as(REVIEWER);
        assertEquals(
                ErrorCode.TEAM_FORBIDDEN,
                codeOf(() -> showService.create(teamId, new ShowRequest("Không được", null, null, null, null))));
    }

    @Test
    void onlyTheReviewerReopensAndOwnerTicksWhatEachRoleCanDo() {
        asOwner();
        String teamId = teamService.create(new TeamRequest("Team D", null)).getId();
        TeamInvitationResponse managerLink = teamService.invite(teamId, new TeamInviteRequest(null, TeamRole.MANAGER));
        Score ownersScore = scoreRepository.save(Score.builder()
                .member(member(OWNER))
                .title("Bản để duyệt")
                .visibility("PRIVATE")
                .build());
        teamService.addScore(teamId, ownersScore.getId());
        String showId = showService
                .create(teamId, new ShowRequest("Hòa nhạc", null, null, null, null))
                .getId();
        ShowDetailResponse detail =
                showService.addItem(showId, new ShowItemRequest(ownersScore.getId(), null, null, null, null));
        String itemId = itemOf(detail, ownersScore.getId()).getId();
        as(REVIEWER);
        teamService.accept(managerLink.getToken());
        String managerId = member(REVIEWER).getId();

        // 1. Chủ nhóm duyệt bài (chưa giao người duyệt): chủ nhóm thành người duyệt của bài
        asOwner();
        ShowDetailResponse approved =
                showService.changeStatus(showId, itemId, new ShowItemStatusRequest(ShowItemStatus.APPROVED, null));
        assertEquals(
                member(OWNER).getId(), itemOf(approved, ownersScore.getId()).getReviewerId());

        // 2. Quản lý không mở lại được bài chủ nhóm đã duyệt, cũng không đổi người duyệt sang mình để mở lại
        as(REVIEWER);
        assertTrue(itemOf(showService.get(showId), ownersScore.getId())
                .getAllowedStatuses()
                .isEmpty());
        assertEquals(
                ErrorCode.SHOW_ITEM_APPROVED_LOCKED,
                codeOf(() -> showService.changeStatus(
                        showId, itemId, new ShowItemStatusRequest(ShowItemStatus.IN_REVIEW, null))));
        assertEquals(
                ErrorCode.SHOW_ITEM_APPROVED_LOCKED,
                codeOf(() -> showService.updateItem(
                        showId, itemId, new ShowItemRequest(null, null, managerId, null, null))));

        // 3. Ai cũng xem được bảng quyền; chỉ chủ nhóm sửa
        TeamPermissionsResponse seen = teamService.permissions(teamId);
        assertFalse(seen.isEditable());
        assertEquals(
                EnumSet.copyOf(TeamPermission.defaultsOf(TeamRole.MANAGER)),
                EnumSet.copyOf(seen.getRoles().get(TeamRole.MANAGER)));

        // 4. Chủ nhóm tích lại quyền của quản lý: sửa thông tin nhóm, duyệt thay, xóa / chia sẻ bản của người khác;
        //    bỏ tích quản lý buổi diễn và quản lý thành viên. Quyền phải có kèm tự bật.
        asOwner();
        assertEquals(
                ErrorCode.TEAM_ROLE_INVALID,
                codeOf(() -> teamService.updatePermissions(
                        teamId, new TeamPermissionsRequest(Map.of(TeamRole.OWNER, List.of())))));
        TeamPermissionsResponse saved = teamService.updatePermissions(
                teamId,
                new TeamPermissionsRequest(Map.of(
                        TeamRole.MANAGER,
                        List.of(TeamPermission.EDIT_TEAM, TeamPermission.APPROVE_ANY, TeamPermission.MANAGE_SCORES))));
        assertTrue(saved.isEditable());
        assertEquals(
                EnumSet.of(
                        TeamPermission.EDIT_TEAM,
                        TeamPermission.APPROVE_ANY,
                        TeamPermission.MANAGE_SCORES,
                        TeamPermission.EDIT_SCORES,
                        TeamPermission.COMMENT),
                EnumSet.copyOf(saved.getRoles().get(TeamRole.MANAGER)));
        // Vai trò không gửi lên thì giữ nguyên
        assertEquals(
                EnumSet.copyOf(TeamPermission.defaultsOf(TeamRole.ARRANGER)),
                EnumSet.copyOf(saved.getRoles().get(TeamRole.ARRANGER)));
        em.flush();
        em.clear();

        // 5. Quản lý giờ làm đúng theo bảng: đổi tên nhóm, duyệt thay, như chủ với bản của người khác; không tạo buổi
        //    diễn, không mời được nữa
        as(REVIEWER);
        assertTrue(teamService.get(teamId).getMyPermissions().contains(TeamPermission.EDIT_TEAM));
        assertEquals(
                "Team D mới",
                teamService.update(teamId, new TeamRequest("Team D mới", null)).getName());
        assertEquals(
                ErrorCode.TEAM_FORBIDDEN,
                codeOf(() -> showService.create(teamId, new ShowRequest("Không được", null, null, null, null))));
        assertEquals(
                ErrorCode.TEAM_FORBIDDEN,
                codeOf(() -> teamService.invite(teamId, new TeamInviteRequest(null, TeamRole.VIEWER))));
        Score score = scoreRepository.findById(ownersScore.getId()).orElseThrow();
        assertEquals(ScoreAccess.OWNER, permissionService.resolve(score).level());
        assertTrue(permissionService.canDelete(score));
        ShowDetailResponse reopened =
                showService.changeStatus(showId, itemId, new ShowItemStatusRequest(ShowItemStatus.IN_REVIEW, null));
        assertEquals(
                ShowItemStatus.IN_REVIEW, itemOf(reopened, ownersScore.getId()).getStatus());
        assertTrue(reopened.getMyPermissions().contains(TeamPermission.APPROVE_ANY));

        // 6. Đổi bảng quyền có ghi nhật ký
        assertTrue(teamService.activities(teamId, 0, 50).getContent().stream()
                .anyMatch(a -> a.getType() == com.ptit.music_be.dto.enums.team.TeamActivityType.PERMISSIONS_CHANGED
                        && "MANAGER".equals(a.getParams().get("role"))));
    }
}
