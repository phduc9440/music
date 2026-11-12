package com.ptit.music_be.service.team.impl;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.TeamActivityType;
import com.ptit.music_be.dto.enums.TeamInvitationStatus;
import com.ptit.music_be.dto.enums.TeamRole;
import com.ptit.music_be.dto.request.TeamInviteRequest;
import com.ptit.music_be.dto.request.TeamRequest;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.TeamActivityResponse;
import com.ptit.music_be.dto.response.TeamInvitationPreviewResponse;
import com.ptit.music_be.dto.response.TeamInvitationResponse;
import com.ptit.music_be.dto.response.TeamMemberResponse;
import com.ptit.music_be.dto.response.TeamResponse;
import com.ptit.music_be.dto.response.TeamScoreResponse;
import com.ptit.music_be.dto.response.TeamTaskResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ShowItem;
import com.ptit.music_be.entity.Team;
import com.ptit.music_be.entity.TeamInvitation;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.repository.ShowItemRepository;
import com.ptit.music_be.repository.ShowRepository;
import com.ptit.music_be.repository.TeamActivityRepository;
import com.ptit.music_be.repository.TeamInvitationRepository;
import com.ptit.music_be.repository.TeamMemberRepository;
import com.ptit.music_be.repository.TeamRepository;
import com.ptit.music_be.service.auth.EmailService;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.team.TeamAccess;
import com.ptit.music_be.service.team.TeamActivityLog;
import com.ptit.music_be.service.team.TeamService;

import lombok.AccessLevel;
import lombok.experimental.FieldDefaults;

@Service
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class TeamServiceImpl implements TeamService {

    static final int MAX_NAME = 100;
    static final int MAX_DESCRIPTION = 1000;
    static final int INVITATION_DAYS = 7;
    static final int MAX_ACTIVITY_PAGE = 50;
    static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    static final SecureRandom RANDOM = new SecureRandom();
    /** Tên vai trò trong email (email hiện chỉ có tiếng Việt, như các email khác). */
    static final Map<TeamRole, String> ROLE_LABEL_VI = Map.of(
            TeamRole.OWNER, "Chủ team",
            TeamRole.MANAGER, "Quản lý",
            TeamRole.ARRANGER, "Người phối",
            TeamRole.VIEWER, "Người xem");

    TeamRepository teamRepository;
    TeamMemberRepository teamMemberRepository;
    TeamInvitationRepository invitationRepository;
    TeamActivityRepository activityRepository;
    ShowRepository showRepository;
    ShowItemRepository showItemRepository;
    ScoreRepository scoreRepository;
    MemberRepository memberRepository;
    EntitlementService entitlementService;
    NotificationService notificationService;
    EmailService emailService;
    TeamAccess access;
    TeamActivityLog activityLog;
    String webUrl;

    public TeamServiceImpl(
            TeamRepository teamRepository,
            TeamMemberRepository teamMemberRepository,
            TeamInvitationRepository invitationRepository,
            TeamActivityRepository activityRepository,
            ShowRepository showRepository,
            ShowItemRepository showItemRepository,
            ScoreRepository scoreRepository,
            MemberRepository memberRepository,
            EntitlementService entitlementService,
            NotificationService notificationService,
            EmailService emailService,
            TeamAccess access,
            TeamActivityLog activityLog,
            @Value("${app.web-url:http://localhost:5173}") String webUrl) {
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.invitationRepository = invitationRepository;
        this.activityRepository = activityRepository;
        this.showRepository = showRepository;
        this.showItemRepository = showItemRepository;
        this.scoreRepository = scoreRepository;
        this.memberRepository = memberRepository;
        this.entitlementService = entitlementService;
        this.notificationService = notificationService;
        this.emailService = emailService;
        this.access = access;
        this.activityLog = activityLog;
        this.webUrl = webUrl.endsWith("/") ? webUrl.substring(0, webUrl.length() - 1) : webUrl;
    }

    // ------------------------------------------------------------------------------------------------ team

    @Override
    @Transactional(readOnly = true)
    public List<TeamResponse> myTeams() {
        Member me = access.currentMember();
        List<TeamMember> mine = teamMemberRepository.findByMemberWithTeam(me.getId());
        if (mine.isEmpty()) {
            return List.of();
        }
        List<String> ids = mine.stream().map(tm -> tm.getTeam().getId()).toList();
        Map<String, Long> members = countMap(teamMemberRepository.countByTeams(ids));
        Map<String, Long> scores = countMap(scoreRepository.countByTeams(ids));
        Map<String, Long> shows = countMap(showRepository.countPreparingByTeams(ids));
        return mine.stream()
                .map(tm -> toResponse(
                        tm.getTeam(),
                        tm.getRole(),
                        members.getOrDefault(tm.getTeam().getId(), 0L),
                        scores.getOrDefault(tm.getTeam().getId(), 0L),
                        shows.getOrDefault(tm.getTeam().getId(), 0L)))
                .toList();
    }

    @Override
    @Transactional
    public TeamResponse create(TeamRequest request) {
        Member me = access.currentMember();
        if (!Boolean.TRUE.equals(entitlementService.limitsOf(me.getId()).team())) {
            throw new AppException(ErrorCode.TEAM_PLAN_REQUIRED);
        }
        Team team = Team.builder().createdBy(me).build();
        apply(team, request);
        team = teamRepository.save(team);
        teamMemberRepository.save(TeamMember.builder()
                .team(team)
                .member(me)
                .role(TeamRole.OWNER)
                .build());
        activityLog.log(team.getId(), me, TeamActivityType.TEAM_CREATED, "team", team.getName());
        return toResponse(team, TeamRole.OWNER, 1, 0, 0);
    }

    @Override
    @Transactional(readOnly = true)
    public TeamResponse get(String teamId) {
        Member me = access.currentMember();
        TeamMember tm = access.membership(teamId, me);
        return toResponse(tm.getTeam(), tm.getRole());
    }

    @Override
    @Transactional
    public TeamResponse update(String teamId, TeamRequest request) {
        Member me = access.currentMember();
        TeamMember tm = access.requireManager(teamId, me);
        Team team = tm.getTeam();
        apply(team, request);
        teamRepository.save(team);
        activityLog.log(team.getId(), me, TeamActivityType.TEAM_UPDATED, "team", team.getName());
        return toResponse(team, tm.getRole());
    }

    @Override
    @Transactional
    public void delete(String teamId) {
        Member me = access.currentMember();
        TeamMember tm = access.membership(teamId, me);
        if (tm.getRole() != TeamRole.OWNER) {
            throw new AppException(ErrorCode.TEAM_FORBIDDEN);
        }
        teamRepository.deleteDirectly(teamId);
    }

    // ------------------------------------------------------------------------------------------------ thành viên

    @Override
    @Transactional(readOnly = true)
    public List<TeamMemberResponse> members(String teamId) {
        access.membership(teamId, access.currentMember());
        return teamMemberRepository.findByTeamWithMember(teamId).stream()
                .map(TeamServiceImpl::toMemberResponse)
                .toList();
    }

    @Override
    @Transactional
    public TeamMemberResponse changeRole(String teamId, String memberId, TeamRole role) {
        Member me = access.currentMember();
        TeamMember mine = access.requireManager(teamId, me);
        if (role == null) {
            throw new AppException(ErrorCode.TEAM_ROLE_INVALID);
        }
        TeamMember target = teamMemberRepository
                .findByTeamIdAndMemberId(teamId, memberId == null ? "" : memberId)
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_MEMBER_NOT_EXISTED));
        // Không tự đổi vai trò mình (chuyển quyền chủ: chủ cấp OWNER cho người khác, người đó hạ vai trò người cũ)
        if (target.getId().equals(mine.getId())) {
            throw new AppException(ErrorCode.TEAM_ROLE_INVALID);
        }
        // MANAGER không cấp OWNER và không đụng tới OWNER
        if (mine.getRole() != TeamRole.OWNER
                && (role == TeamRole.OWNER || target.getRole() == TeamRole.OWNER)) {
            throw new AppException(ErrorCode.TEAM_FORBIDDEN);
        }
        if (target.getRole() == role) {
            return toMemberResponse(target);
        }
        if (target.getRole() == TeamRole.OWNER && teamMemberRepository.countByTeamIdAndRole(teamId, TeamRole.OWNER) <= 1) {
            throw new AppException(ErrorCode.TEAM_LAST_OWNER);
        }
        TeamRole old = target.getRole();
        target.setRole(role);
        teamMemberRepository.save(target);
        // VIEWER không phối/duyệt được nữa: bỏ phân công của người đó trong các show của team
        if (role == TeamRole.VIEWER) {
            showItemRepository.clearArranger(teamId, target.getMember().getId());
            showItemRepository.clearReviewer(teamId, target.getMember().getId());
        }
        Team team = mine.getTeam();
        activityLog.log(
                teamId,
                me,
                TeamActivityType.ROLE_CHANGED,
                "name",
                TeamAccess.displayName(target.getMember()),
                "from",
                old.name(),
                "role",
                role.name());
        notificationService.notify(
                target.getMember(),
                me,
                NotificationType.TEAM_ROLE_CHANGED,
                null,
                "Vai trò của bạn trong team " + team.getName() + " đã đổi thành " + ROLE_LABEL_VI.get(role),
                NotificationService.params("team", team.getName(), "teamId", teamId, "role", role.name()));
        return toMemberResponse(target);
    }

    @Override
    @Transactional
    public void removeMember(String teamId, String memberId) {
        Member me = access.currentMember();
        TeamMember mine = access.membership(teamId, me);
        TeamMember target = teamMemberRepository
                .findByTeamIdAndMemberId(teamId, memberId == null ? "" : memberId)
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_MEMBER_NOT_EXISTED));
        boolean self = target.getId().equals(mine.getId());
        if (!self) {
            if (!mine.getRole().canManage()) {
                throw new AppException(ErrorCode.TEAM_FORBIDDEN);
            }
            if (mine.getRole() != TeamRole.OWNER && target.getRole() == TeamRole.OWNER) {
                throw new AppException(ErrorCode.TEAM_FORBIDDEN);
            }
        }
        if (target.getRole() == TeamRole.OWNER && teamMemberRepository.countByTeamIdAndRole(teamId, TeamRole.OWNER) <= 1) {
            throw new AppException(ErrorCode.TEAM_LAST_OWNER);
        }
        String targetId = target.getMember().getId();
        showItemRepository.clearArranger(teamId, targetId);
        showItemRepository.clearReviewer(teamId, targetId);
        teamMemberRepository.delete(target);
        // Bản nhạc người đó đã chuyển vào team vẫn ở lại team (người đó vẫn là chủ bản nhạc nên vẫn mở được)
        Team team = mine.getTeam();
        if (self) {
            activityLog.log(teamId, me, TeamActivityType.MEMBER_LEFT, "name", TeamAccess.displayName(me));
        } else {
            activityLog.log(
                    teamId, me, TeamActivityType.MEMBER_REMOVED, "name", TeamAccess.displayName(target.getMember()));
            notificationService.notify(
                    target.getMember(),
                    me,
                    NotificationType.TEAM_REMOVED,
                    null,
                    "Bạn đã bị xóa khỏi team " + team.getName(),
                    NotificationService.params("team", team.getName()));
        }
    }

    // ------------------------------------------------------------------------------------------------ lời mời

    @Override
    @Transactional(readOnly = true)
    public List<TeamInvitationResponse> invitations(String teamId) {
        access.requireManager(teamId, access.currentMember());
        return invitationRepository.findUsable(teamId, LocalDateTime.now()).stream()
                .map(i -> toInvitationResponse(i, null))
                .toList();
    }

    @Override
    @Transactional
    public TeamInvitationResponse invite(String teamId, TeamInviteRequest request) {
        Member me = access.currentMember();
        access.requireManager(teamId, me);
        Team team = teamRepository
                .findByIdForUpdate(teamId)
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_NOT_EXISTED));
        TeamRole role = request == null ? null : request.getRole();
        // Không mời thẳng làm OWNER: vào team rồi chủ team mới cấp
        if (role == null || role == TeamRole.OWNER) {
            throw new AppException(ErrorCode.TEAM_ROLE_INVALID);
        }
        LocalDateTime now = LocalDateTime.now();
        PlanLimits limits = entitlementService.limitsOf(team.getCreatedBy().getId());
        if (!Boolean.TRUE.equals(limits.team())) {
            throw new AppException(ErrorCode.TEAM_PLAN_REQUIRED);
        }
        Integer limit = limits.teamMembers();
        if (limit != null
                && teamMemberRepository.countByTeamId(teamId) + invitationRepository.countUsable(teamId, now) >= limit) {
            throw new AppException(ErrorCode.TEAM_MEMBER_LIMIT);
        }

        String email = blankToNull(request.getEmail());
        Member invitee = null;
        if (email != null) {
            email = email.toLowerCase(Locale.ROOT);
            if (email.length() > 255 || !EMAIL.matcher(email).matches()) {
                throw new AppException(ErrorCode.TEAM_EMAIL_INVALID);
            }
            invitee = memberRepository.findByEmail(email).orElse(null);
            if (invitee != null && teamMemberRepository.existsByTeamIdAndMemberId(teamId, invitee.getId())) {
                throw new AppException(ErrorCode.TEAM_ALREADY_MEMBER);
            }
            if (!invitationRepository.findUsableByEmail(teamId, email, now).isEmpty()) {
                throw new AppException(ErrorCode.TEAM_INVITATION_DUPLICATED);
            }
        }

        String token = newToken();
        TeamInvitation invitation = invitationRepository.save(TeamInvitation.builder()
                .team(team)
                .email(email)
                .role(role)
                .tokenHash(sha256(token))
                .status(TeamInvitationStatus.PENDING)
                .invitedBy(me)
                .expiresAt(now.plusDays(INVITATION_DAYS))
                .build());

        String inviter = TeamAccess.displayName(me);
        if (email != null) {
            emailService.sendTeamInvitationEmail(
                    email, team.getName(), inviter, ROLE_LABEL_VI.get(role), inviteLink(token));
            // Người đã có tài khoản thấy lời mời ở chuông và ở trang Team (không cần mở email)
            notificationService.notify(
                    invitee,
                    me,
                    NotificationType.TEAM_INVITED,
                    null,
                    inviter + " mời bạn vào team " + team.getName() + " với vai trò " + ROLE_LABEL_VI.get(role),
                    NotificationService.params("name", inviter, "team", team.getName(), "role", role.name()));
        }
        activityLog.log(
                teamId, me, TeamActivityType.INVITATION_SENT, "email", email, "role", role.name());
        return toInvitationResponse(invitation, token);
    }

    @Override
    @Transactional
    public void revokeInvitation(String teamId, String invitationId) {
        access.requireManager(teamId, access.currentMember());
        TeamInvitation invitation = invitationRepository
                .findById(invitationId == null ? "" : invitationId)
                .filter(i -> i.getTeam().getId().equals(teamId))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        if (invitation.getStatus() == TeamInvitationStatus.PENDING) {
            invitation.setStatus(TeamInvitationStatus.REVOKED);
            invitationRepository.save(invitation);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public TeamInvitationPreviewResponse preview(String token) {
        Member me = access.currentMember();
        TeamInvitation i = invitationRepository
                .findByTokenHash(sha256(token == null ? "" : token))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        LocalDateTime now = LocalDateTime.now();
        String state = switch (i.getStatus()) {
            case ACCEPTED -> "USED";
            case REVOKED, DECLINED -> "REVOKED";
            case PENDING -> i.getExpiresAt().isAfter(now) ? "VALID" : "EXPIRED";
        };
        return TeamInvitationPreviewResponse.builder()
                .teamId(i.getTeam().getId())
                .teamName(i.getTeam().getName())
                .teamDescription(i.getTeam().getDescription())
                .role(i.getRole())
                .invitedByName(TeamAccess.displayName(i.getInvitedBy()))
                .email(i.getEmail())
                .expiresAt(i.getExpiresAt())
                .state(state)
                .alreadyMember(teamMemberRepository.existsByTeamIdAndMemberId(i.getTeam().getId(), me.getId()))
                .emailMismatch(i.getEmail() != null && !i.getEmail().equalsIgnoreCase(me.getEmail()))
                .build();
    }

    @Override
    @Transactional
    public TeamResponse accept(String token) {
        TeamInvitation invitation = invitationRepository
                .findByTokenHashForUpdate(sha256(token == null ? "" : token))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        return join(invitation, access.currentMember());
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeamInvitationResponse> myInvitations() {
        Member me = access.currentMember();
        return invitationRepository.findUsableForEmail(me.getEmail(), LocalDateTime.now()).stream()
                .filter(i -> !teamMemberRepository.existsByTeamIdAndMemberId(i.getTeam().getId(), me.getId()))
                .map(i -> toInvitationResponse(i, null))
                .toList();
    }

    @Override
    @Transactional
    public TeamResponse acceptMine(String invitationId) {
        Member me = access.currentMember();
        TeamInvitation invitation = myInvitation(invitationId, me);
        TeamInvitation locked = invitationRepository
                .findByTokenHashForUpdate(invitation.getTokenHash())
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        return join(locked, me);
    }

    @Override
    @Transactional
    public void declineMine(String invitationId) {
        TeamInvitation invitation = myInvitation(invitationId, access.currentMember());
        invitation.setStatus(TeamInvitationStatus.DECLINED);
        invitationRepository.save(invitation);
    }

    private TeamInvitation myInvitation(String invitationId, Member me) {
        return invitationRepository
                .findById(invitationId == null ? "" : invitationId)
                .filter(i -> i.getEmail() != null && i.getEmail().equalsIgnoreCase(me.getEmail()))
                .filter(i -> i.isUsable(LocalDateTime.now()))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
    }

    /** Dùng lời mời (đã khóa dòng): kiểm tra còn hạn, đúng email, còn chỗ theo gói, rồi thêm thành viên. */
    private TeamResponse join(TeamInvitation invitation, Member me) {
        LocalDateTime now = LocalDateTime.now();
        if (!invitation.isUsable(now)) {
            throw new AppException(ErrorCode.TEAM_INVITATION_INVALID);
        }
        if (invitation.getEmail() != null && !invitation.getEmail().equalsIgnoreCase(me.getEmail())) {
            throw new AppException(ErrorCode.TEAM_INVITATION_EMAIL_MISMATCH);
        }
        // Khóa team để hai người chấp nhận cùng lúc không vượt hạn mức thành viên
        Team team = teamRepository
                .findByIdForUpdate(invitation.getTeam().getId())
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        if (teamMemberRepository.existsByTeamIdAndMemberId(team.getId(), me.getId())) {
            throw new AppException(ErrorCode.TEAM_ALREADY_MEMBER);
        }
        PlanLimits limits = entitlementService.limitsOf(team.getCreatedBy().getId());
        if (!Boolean.TRUE.equals(limits.team())) {
            throw new AppException(ErrorCode.TEAM_PLAN_REQUIRED);
        }
        if (limits.teamMembers() != null && teamMemberRepository.countByTeamId(team.getId()) >= limits.teamMembers()) {
            throw new AppException(ErrorCode.TEAM_MEMBER_LIMIT);
        }
        teamMemberRepository.save(TeamMember.builder()
                .team(team)
                .member(me)
                .role(invitation.getRole())
                .build());
        invitation.setStatus(TeamInvitationStatus.ACCEPTED);
        invitation.setAcceptedBy(me);
        invitation.setAcceptedAt(now);
        invitationRepository.save(invitation);

        String name = TeamAccess.displayName(me);
        activityLog.log(
                team.getId(), me, TeamActivityType.MEMBER_JOINED, "name", name, "role", invitation.getRole().name());
        notificationService.notify(
                invitation.getInvitedBy(),
                me,
                NotificationType.TEAM_MEMBER_JOINED,
                null,
                name + " đã tham gia team " + team.getName(),
                NotificationService.params("name", name, "team", team.getName(), "teamId", team.getId()));
        return toResponse(team, invitation.getRole());
    }

    // ------------------------------------------------------------------------------------------------ bản nhạc

    @Override
    @Transactional(readOnly = true)
    public List<TeamScoreResponse> scores(String teamId) {
        Member me = access.currentMember();
        TeamMember mine = access.membership(teamId, me);
        return scoreRepository.findByTeamWithOwner(teamId).stream()
                .map(s -> toScoreResponse(s, mine.getRole().canManage() || isOwner(s, me)))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeamScoreResponse> myPersonalScores(String teamId) {
        Member me = access.currentMember();
        access.membership(teamId, me);
        return scoreRepository.findPersonalOf(me.getId()).stream()
                .map(s -> toScoreResponse(s, false))
                .toList();
    }

    @Override
    @Transactional
    public TeamScoreResponse addScore(String teamId, String scoreId) {
        Member me = access.currentMember();
        TeamMember mine = access.membership(teamId, me);
        if (mine.getRole() == TeamRole.VIEWER) {
            throw new AppException(ErrorCode.TEAM_FORBIDDEN);
        }
        Score score = scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        if (!isOwner(score, me)) {
            throw new AppException(ErrorCode.TEAM_SCORE_NOT_OWNER);
        }
        if (Boolean.TRUE.equals(score.getIsOfficial())) {
            throw new AppException(ErrorCode.TEAM_SCORE_OFFICIAL);
        }
        if (teamId.equals(score.getTeamId())) {
            return toScoreResponse(score, true);
        }
        if (score.getTeamId() != null) {
            throw new AppException(ErrorCode.TEAM_SCORE_IN_OTHER_TEAM);
        }
        score.setTeamId(teamId);
        scoreRepository.save(score);
        activityLog.log(
                teamId, me, TeamActivityType.SCORE_ADDED, "score", score.getTitle(), "scoreId", score.getId());
        return toScoreResponse(score, true);
    }

    @Override
    @Transactional
    public void removeScore(String teamId, String scoreId) {
        Member me = access.currentMember();
        TeamMember mine = access.membership(teamId, me);
        Score score = scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .filter(s -> teamId.equals(s.getTeamId()))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_SCORE_NOT_IN_TEAM));
        if (!mine.getRole().canManage() && !isOwner(score, me)) {
            throw new AppException(ErrorCode.TEAM_FORBIDDEN);
        }
        showItemRepository.deleteByTeamAndScore(teamId, score.getId());
        score.setTeamId(null);
        scoreRepository.save(score);
        activityLog.log(teamId, me, TeamActivityType.SCORE_REMOVED, "score", score.getTitle());
    }

    // ------------------------------------------------------------------------------------------------ hoạt động, việc

    @Override
    @Transactional(readOnly = true)
    public PageResponse<TeamActivityResponse> activities(String teamId, int page, int size) {
        access.membership(teamId, access.currentMember());
        int safeSize = size <= 0 ? 20 : Math.min(size, MAX_ACTIVITY_PAGE);
        Page<com.ptit.music_be.entity.TeamActivity> result =
                activityRepository.findByTeam(teamId, PageRequest.of(Math.max(page, 0), safeSize));
        return PageResponse.<TeamActivityResponse>builder()
                .content(result.getContent().stream()
                        .map(a -> TeamActivityResponse.builder()
                                .id(a.getId())
                                .type(a.getType())
                                .actorName(TeamAccess.displayName(a.getActor()))
                                .params(activityLog.paramsOf(a))
                                .createdAt(a.getCreatedAt())
                                .build())
                        .toList())
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeamTaskResponse> myTasks() {
        Member me = access.currentMember();
        List<ShowItem> items = showItemRepository.findOpenTasksOf(me.getId());
        if (items.isEmpty()) {
            return List.of();
        }
        // Bản nhạc ở thùng rác bị lọc khỏi findAllById nên bài đó cũng không hiện
        Map<String, Score> scores = scoresById(items.stream().map(ShowItem::getScoreId).toList());
        return items.stream()
                .filter(i -> scores.containsKey(i.getScoreId()))
                .map(i -> TeamTaskResponse.builder()
                        .itemId(i.getId())
                        .showId(i.getShow().getId())
                        .showName(i.getShow().getName())
                        .showDate(i.getShow().getShowDate())
                        .teamId(i.getShow().getTeam().getId())
                        .teamName(i.getShow().getTeam().getName())
                        .scoreId(i.getScoreId())
                        .scoreTitle(scores.get(i.getScoreId()).getTitle())
                        .status(i.getStatus())
                        .dueDate(i.getDueDate())
                        .asArranger(i.getArranger() != null && i.getArranger().getId().equals(me.getId()))
                        .asReviewer(i.getReviewer() != null && i.getReviewer().getId().equals(me.getId()))
                        .build())
                .toList();
    }

    // ------------------------------------------------------------------------------------------------ helpers

    private Map<String, Score> scoresById(Collection<String> ids) {
        return scoreRepository.findAllById(ids).stream().collect(Collectors.toMap(Score::getId, Function.identity()));
    }

    private void apply(Team team, TeamRequest request) {
        String name = request == null ? null : blankToNull(request.getName());
        String description = request == null ? null : blankToNull(request.getDescription());
        if (name == null
                || name.length() > MAX_NAME
                || (description != null && description.length() > MAX_DESCRIPTION)) {
            throw new AppException(ErrorCode.TEAM_NAME_INVALID);
        }
        team.setName(name);
        team.setDescription(description);
    }

    private TeamResponse toResponse(Team team, TeamRole role) {
        return toResponse(
                team,
                role,
                teamMemberRepository.countByTeamId(team.getId()),
                countMap(scoreRepository.countByTeams(List.of(team.getId()))).getOrDefault(team.getId(), 0L),
                countMap(showRepository.countPreparingByTeams(List.of(team.getId())))
                        .getOrDefault(team.getId(), 0L));
    }

    private TeamResponse toResponse(Team team, TeamRole role, long members, long scores, long shows) {
        PlanLimits limits = entitlementService.limitsOf(team.getCreatedBy().getId());
        return TeamResponse.builder()
                .id(team.getId())
                .name(team.getName())
                .description(team.getDescription())
                .avatarUrl(team.getAvatarUrl())
                .myRole(role)
                .memberCount(members)
                .scoreCount(scores)
                .preparingShows(shows)
                .createdByName(TeamAccess.displayName(team.getCreatedBy()))
                .createdAt(team.getCreatedAt())
                .memberLimit(limits.teamMembers())
                .planActive(Boolean.TRUE.equals(limits.team()))
                .build();
    }

    public static TeamMemberResponse toMemberResponse(TeamMember tm) {
        Member m = tm.getMember();
        return TeamMemberResponse.builder()
                .memberId(m.getId())
                .fullName(m.getFullName())
                .email(m.getEmail())
                .avatarUrl(m.getAvatarUrl())
                .role(tm.getRole())
                .joinedAt(tm.getJoinedAt())
                .build();
    }

    private TeamInvitationResponse toInvitationResponse(TeamInvitation i, String token) {
        return TeamInvitationResponse.builder()
                .id(i.getId())
                .teamId(i.getTeam().getId())
                .teamName(i.getTeam().getName())
                .email(i.getEmail())
                .role(i.getRole())
                .invitedByName(TeamAccess.displayName(i.getInvitedBy()))
                .createdAt(i.getCreatedAt())
                .expiresAt(i.getExpiresAt())
                .token(token)
                .build();
    }

    private static TeamScoreResponse toScoreResponse(Score s, boolean canRemove) {
        return TeamScoreResponse.builder()
                .id(s.getId())
                .title(s.getTitle())
                .composer(s.getComposer())
                .ownerId(s.getMember() == null ? null : s.getMember().getId())
                .ownerName(TeamAccess.displayName(s.getMember()))
                .measureCount(s.getMeasureCount())
                .difficulty(s.getDifficulty() == null ? null : s.getDifficulty().name())
                .updatedAt(s.getUpdatedAt())
                .canRemove(canRemove)
                .build();
    }

    private static boolean isOwner(Score score, Member me) {
        return score.getMember() != null && score.getMember().getId().equals(me.getId());
    }

    private static Map<String, Long> countMap(List<Object[]> rows) {
        Map<String, Long> map = new HashMap<>();
        for (Object[] r : rows) {
            map.put((String) r[0], ((Number) r[1]).longValue());
        }
        return map;
    }

    private String inviteLink(String token) {
        return webUrl + "/teams/invite/" + token;
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String sha256(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
