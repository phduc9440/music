package com.ptit.music_be.service.team.impl;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Collection;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.enums.team.TeamActivityType;
import com.ptit.music_be.dto.enums.team.TeamInvitationStatus;
import com.ptit.music_be.dto.enums.team.TeamMemberKind;
import com.ptit.music_be.dto.enums.team.TeamPermission;
import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.dto.request.team.TeamInviteRequest;
import com.ptit.music_be.dto.request.team.TeamPermissionsRequest;
import com.ptit.music_be.dto.request.team.TeamRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.team.RestorableItemResponse;
import com.ptit.music_be.dto.response.team.TeamActivityResponse;
import com.ptit.music_be.dto.response.team.TeamInvitationPreviewResponse;
import com.ptit.music_be.dto.response.team.TeamInvitationResponse;
import com.ptit.music_be.dto.response.team.TeamMemberResponse;
import com.ptit.music_be.dto.response.team.TeamPermissionsResponse;
import com.ptit.music_be.dto.response.team.TeamResponse;
import com.ptit.music_be.dto.response.team.TeamScoreResponse;
import com.ptit.music_be.dto.response.team.TeamTaskResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ShowItem;
import com.ptit.music_be.entity.Team;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.repository.team.ShowItemRepository;
import com.ptit.music_be.repository.team.ShowRepository;
import com.ptit.music_be.repository.team.TeamMemberRepository;
import com.ptit.music_be.repository.team.TeamRepository;
import com.ptit.music_be.service.auth.EmailService;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.team.RolePermissions;
import com.ptit.music_be.service.team.TeamAccess;
import com.ptit.music_be.service.team.TeamActivityLog;
import com.ptit.music_be.service.team.TeamPermissionStore;
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
            TeamRole.OWNER, "Chủ nhóm",
            TeamRole.MANAGER, "Quản lý",
            TeamRole.ARRANGER, "Người phối",
            TeamRole.VIEWER, "Người xem");

    TeamRepository teamRepository;
    TeamMemberRepository teamMemberRepository;
    ShowRepository showRepository;
    ShowItemRepository showItemRepository;
    ScoreRepository scoreRepository;
    MemberRepository memberRepository;
    EntitlementService entitlementService;
    NotificationService notificationService;
    EmailService emailService;
    TeamAccess access;
    TeamActivityLog activityLog;
    TeamPermissionStore permissionStore;
    String webUrl;

    public TeamServiceImpl(
            TeamRepository teamRepository,
            TeamMemberRepository teamMemberRepository,
            ShowRepository showRepository,
            ShowItemRepository showItemRepository,
            ScoreRepository scoreRepository,
            MemberRepository memberRepository,
            EntitlementService entitlementService,
            NotificationService notificationService,
            EmailService emailService,
            TeamAccess access,
            TeamActivityLog activityLog,
            TeamPermissionStore permissionStore,
            @Value("${app.web-url:http://localhost:5173}") String webUrl) {
        this.teamRepository = teamRepository;
        this.teamMemberRepository = teamMemberRepository;
        this.showRepository = showRepository;
        this.showItemRepository = showItemRepository;
        this.scoreRepository = scoreRepository;
        this.memberRepository = memberRepository;
        this.entitlementService = entitlementService;
        this.notificationService = notificationService;
        this.emailService = emailService;
        this.access = access;
        this.activityLog = activityLog;
        this.permissionStore = permissionStore;
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
        Map<String, Map<TeamRole, Set<TeamPermission>>> matrices = permissionStore.matrices(ids);
        return mine.stream()
                .map(tm -> toResponse(
                        tm.getTeam(),
                        new RolePermissions(
                                tm.getRole(), matrices.get(tm.getTeam().getId()).get(tm.getRole())),
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
                .kind(TeamMemberKind.MEMBER)
                .team(team)
                .member(me)
                .role(TeamRole.OWNER)
                .build());
        activityLog.log(team.getId(), me, TeamActivityType.TEAM_CREATED, "team", team.getName());
        return toResponse(team, new RolePermissions(TeamRole.OWNER, null), 1, 0, 0);
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
        TeamMember tm = access.require(teamId, me, TeamPermission.EDIT_TEAM);
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
        TeamMember tm = access.requireOwner(teamId, me);
        // Xóa mềm: mọi dữ liệu giữ nguyên, team biến mất với thành viên; chủ team khôi phục được trong 30 ngày
        Team team = tm.getTeam();
        team.markDeleted(me, false, null);
        teamRepository.save(team);
        for (TeamMember m : teamMemberRepository.findByTeamWithMember(teamId)) {
            if (m.getMember().getId().equals(me.getId())) {
                continue;
            }
            notificationService.notify(
                    m.getMember(),
                    me,
                    NotificationType.TEAM_DELETED,
                    null,
                    TeamAccess.displayName(me) + " đã xóa nhóm " + team.getName(),
                    NotificationService.params("name", TeamAccess.displayName(me), "team", team.getName()));
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<RestorableItemResponse> deletedTeams() {
        Member me = access.currentMember();
        LocalDateTime since = LocalDateTime.now().minusDays(Team.RESTORE_DAYS);
        return teamMemberRepository.findRestorableOwnedBy(me.getId(), since).stream()
                .map(tm -> toRestorable(tm.getTeam()))
                .toList();
    }

    @Override
    @Transactional
    public TeamResponse restore(String teamId) {
        Member me = access.currentMember();
        TeamMember tm = teamMemberRepository
                .findAnyStateByTeamIdAndMemberId(teamId == null ? "" : teamId, me.getId())
                .filter(m -> m.getTeam().isDeleted())
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_NOT_EXISTED));
        if (tm.getRole() != TeamRole.OWNER) {
            throw new AppException(ErrorCode.TEAM_OWNER_ONLY);
        }
        Team team = tm.getTeam();
        if (team.isDeletedByAdmin()) {
            throw new AppException(ErrorCode.TEAM_RESTORE_BY_ADMIN_ONLY);
        }
        restoreTeam(team, me, false);
        return toResponse(team, tm.getRole());
    }

    /**
     * Khôi phục team đã xóa mềm (chủ team hoặc quản trị viên gọi, đã kiểm tra quyền): kiểm tra còn hạn 30 ngày, bỏ dấu xóa,
     * ghi nhật ký và báo cho các thành viên khác.
     */
    public void restoreTeam(Team team, Member actor, boolean byAdmin) {
        if (!Team.restorable(team.getDeletedAt(), LocalDateTime.now())) {
            throw new AppException(ErrorCode.TEAM_RESTORE_EXPIRED);
        }
        team.restore();
        teamRepository.save(team);
        activityLog.log(
                team.getId(),
                actor,
                TeamActivityType.TEAM_RESTORED,
                "team",
                team.getName(),
                "byAdmin",
                String.valueOf(byAdmin));
        for (TeamMember m : teamMemberRepository.findByTeamWithMember(team.getId())) {
            if (m.getMember().getId().equals(actor.getId())) {
                continue;
            }
            notificationService.notify(
                    m.getMember(),
                    actor,
                    NotificationType.TEAM_RESTORED,
                    null,
                    "Nhóm " + team.getName() + " đã được khôi phục",
                    NotificationService.params("team", team.getName(), "teamId", team.getId()));
        }
    }

    public static RestorableItemResponse toRestorable(Team team) {
        return RestorableItemResponse.builder()
                .id(team.getId())
                .name(team.getName())
                .description(team.getDescription())
                .deletedAt(team.getDeletedAt())
                .deletedByName(TeamAccess.displayName(team.getDeletedBy()))
                .restorableUntil(Team.restorableUntil(team.getDeletedAt()))
                .build();
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
        TeamMember mine = access.membership(teamId, me);
        RolePermissions perms = access.permissions(mine);
        if (!perms.canInvite()) {
            throw new AppException(ErrorCode.TEAM_FORBIDDEN);
        }
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
        // Phải được đụng tới cả vai trò cũ lẫn vai trò mới (mặc định quản lý chỉ đổi qua lại người phối / người xem;
        // cấp hay thu hồi chủ nhóm luôn là việc của chủ nhóm)
        if (!perms.canAssign(target.getRole()) || !perms.canAssign(role)) {
            throw new AppException(ErrorCode.TEAM_ROLE_SCOPE);
        }
        if (target.getRole() == role) {
            return toMemberResponse(target);
        }
        if (target.getRole() == TeamRole.OWNER
                && teamMemberRepository.countByTeamIdAndRole(teamId, TeamRole.OWNER) <= 1) {
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
                "Vai trò của bạn trong nhóm " + team.getName() + " đã đổi thành " + ROLE_LABEL_VI.get(role),
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
            RolePermissions perms = access.permissions(mine);
            if (!perms.canInvite()) {
                throw new AppException(ErrorCode.TEAM_FORBIDDEN);
            }
            // Mặc định quản lý chỉ xóa người phối, người xem; chủ nhóm chỉ chủ nhóm xóa được
            if (!perms.canAssign(target.getRole())) {
                throw new AppException(ErrorCode.TEAM_ROLE_SCOPE);
            }
        }
        if (target.getRole() == TeamRole.OWNER
                && teamMemberRepository.countByTeamIdAndRole(teamId, TeamRole.OWNER) <= 1) {
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
                    "Bạn đã bị xóa khỏi nhóm " + team.getName(),
                    NotificationService.params("team", team.getName()));
        }
    }

    // ------------------------------------------------------------------------------------------------ bảng quyền

    @Override
    @Transactional(readOnly = true)
    public TeamPermissionsResponse permissions(String teamId) {
        TeamMember mine = access.membership(teamId, access.currentMember());
        return toPermissionsResponse(teamId, mine.getRole() == TeamRole.OWNER);
    }

    @Override
    @Transactional
    public TeamPermissionsResponse updatePermissions(String teamId, TeamPermissionsRequest request) {
        Member me = access.currentMember();
        TeamMember mine = access.requireOwner(teamId, me);
        Map<TeamRole, List<TeamPermission>> roles =
                request == null || request.getRoles() == null ? Map.of() : request.getRoles();
        // Chủ nhóm luôn đủ quyền, không chỉnh được
        if (roles.keySet().stream().anyMatch(r -> r == null || r == TeamRole.OWNER)) {
            throw new AppException(ErrorCode.TEAM_ROLE_INVALID);
        }
        Map<TeamRole, Set<TeamPermission>> before = permissionStore.matrix(teamId);
        for (TeamRole role : TeamPermissionStore.CONFIGURABLE) {
            if (!roles.containsKey(role)) {
                continue;
            }
            Set<TeamPermission> wanted = roles.get(role) == null
                    ? EnumSet.noneOf(TeamPermission.class)
                    : roles.get(role).stream()
                            .filter(Objects::nonNull)
                            .collect(Collectors.toCollection(() -> EnumSet.noneOf(TeamPermission.class)));
            Set<TeamPermission> old = before.get(role);
            Set<TeamPermission> saved = permissionStore.save(mine.getTeam(), role, wanted);
            if (saved.equals(old)) {
                continue;
            }
            activityLog.log(
                    teamId,
                    me,
                    TeamActivityType.PERMISSIONS_CHANGED,
                    "role",
                    role.name(),
                    "added",
                    joinNames(saved, old),
                    "removed",
                    joinNames(old, saved));
        }
        return toPermissionsResponse(teamId, true);
    }

    private TeamPermissionsResponse toPermissionsResponse(String teamId, boolean editable) {
        Map<TeamRole, List<TeamPermission>> roles = new EnumMap<>(TeamRole.class);
        Map<TeamRole, List<TeamPermission>> defaults = new EnumMap<>(TeamRole.class);
        permissionStore.matrix(teamId).forEach((role, perms) -> roles.put(role, List.copyOf(perms)));
        for (TeamRole role : TeamPermissionStore.CONFIGURABLE) {
            defaults.put(role, List.copyOf(TeamPermission.defaultsOf(role)));
        }
        return TeamPermissionsResponse.builder()
                .roles(roles)
                .defaults(defaults)
                .editable(editable)
                .build();
    }

    /** Tên các quyền có trong {@code a} mà không có trong {@code b}, cách nhau bởi dấu phẩy; không có thì null. */
    private static String joinNames(Set<TeamPermission> a, Set<TeamPermission> b) {
        String joined = a.stream().filter(p -> !b.contains(p)).map(Enum::name).collect(Collectors.joining(","));
        return joined.isEmpty() ? null : joined;
    }

    /** Có quyền mời / quản lý thành viên ở ít nhất một vai trò; trả về quyền để kiểm tra tiếp theo vai trò cụ thể. */
    private RolePermissions requireInviter(String teamId, Member me) {
        RolePermissions perms = access.permissions(access.membership(teamId, me));
        if (!perms.canInvite()) {
            throw new AppException(ErrorCode.TEAM_FORBIDDEN);
        }
        return perms;
    }

    // ------------------------------------------------------------------------------------------------ lời mời

    @Override
    @Transactional(readOnly = true)
    public List<TeamInvitationResponse> invitations(String teamId) {
        requireInviter(teamId, access.currentMember());
        return teamMemberRepository.findUsableInvitations(teamId, LocalDateTime.now()).stream()
                .map(i -> toInvitationResponse(i, null))
                .toList();
    }

    @Override
    @Transactional
    public TeamInvitationResponse invite(String teamId, TeamInviteRequest request) {
        Member me = access.currentMember();
        RolePermissions perms = requireInviter(teamId, me);
        Team team = teamRepository
                .findByIdForUpdate(teamId)
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_NOT_EXISTED));
        TeamRole role = request == null ? null : request.getRole();
        // Không mời thẳng làm OWNER: vào team rồi chủ team mới cấp
        if (role == null || role == TeamRole.OWNER) {
            throw new AppException(ErrorCode.TEAM_ROLE_INVALID);
        }
        // Mời người phối / người xem cần MANAGE_MEMBERS, mời làm quản lý cần MANAGE_MANAGERS
        if (!perms.canAssign(role)) {
            throw new AppException(ErrorCode.TEAM_ROLE_SCOPE);
        }
        LocalDateTime now = LocalDateTime.now();
        PlanLimits limits = entitlementService.limitsOf(team.getCreatedBy().getId());
        if (!Boolean.TRUE.equals(limits.team())) {
            throw new AppException(ErrorCode.TEAM_PLAN_REQUIRED);
        }
        Integer limit = limits.teamMembers();
        if (limit != null
                && teamMemberRepository.countByTeamId(teamId) + teamMemberRepository.countUsableInvitations(teamId, now)
                        >= limit) {
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
            if (!teamMemberRepository
                    .findUsableInvitationsByEmail(teamId, email, now)
                    .isEmpty()) {
                throw new AppException(ErrorCode.TEAM_INVITATION_DUPLICATED);
            }
        }

        String token = newToken();
        TeamMember invitation = teamMemberRepository.save(TeamMember.builder()
                .kind(TeamMemberKind.INVITATION)
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
                    inviter + " mời bạn vào nhóm " + team.getName() + " với vai trò " + ROLE_LABEL_VI.get(role),
                    NotificationService.params("name", inviter, "team", team.getName(), "role", role.name()));
        }
        activityLog.log(teamId, me, TeamActivityType.INVITATION_SENT, "email", email, "role", role.name());
        return toInvitationResponse(invitation, token);
    }

    @Override
    @Transactional
    public void revokeInvitation(String teamId, String invitationId) {
        RolePermissions perms = requireInviter(teamId, access.currentMember());
        TeamMember invitation = teamMemberRepository
                .findInvitationById(invitationId == null ? "" : invitationId)
                .filter(i -> i.getTeam().getId().equals(teamId))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        // Thu hồi theo cùng luật với mời
        if (!perms.canAssign(invitation.getRole())) {
            throw new AppException(ErrorCode.TEAM_ROLE_SCOPE);
        }
        if (invitation.getStatus() == TeamInvitationStatus.PENDING) {
            invitation.setStatus(TeamInvitationStatus.REVOKED);
            teamMemberRepository.save(invitation);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public TeamInvitationPreviewResponse preview(String token) {
        Member me = access.currentMember();
        TeamMember i = teamMemberRepository
                .findInvitationByTokenHash(sha256(token == null ? "" : token))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        LocalDateTime now = LocalDateTime.now();
        String state =
                switch (i.getStatus()) {
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
                .alreadyMember(teamMemberRepository.existsByTeamIdAndMemberId(
                        i.getTeam().getId(), me.getId()))
                .emailMismatch(i.getEmail() != null && !i.getEmail().equalsIgnoreCase(me.getEmail()))
                .build();
    }

    @Override
    @Transactional
    public TeamResponse accept(String token) {
        TeamMember invitation = teamMemberRepository
                .findInvitationByTokenHashForUpdate(sha256(token == null ? "" : token))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        return join(invitation, access.currentMember());
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeamInvitationResponse> myInvitations() {
        Member me = access.currentMember();
        return teamMemberRepository.findUsableInvitationsForEmail(me.getEmail(), LocalDateTime.now()).stream()
                .filter(i -> !teamMemberRepository.existsByTeamIdAndMemberId(
                        i.getTeam().getId(), me.getId()))
                .map(i -> toInvitationResponse(i, null))
                .toList();
    }

    @Override
    @Transactional
    public TeamResponse acceptMine(String invitationId) {
        Member me = access.currentMember();
        TeamMember invitation = myInvitation(invitationId, me);
        TeamMember locked = teamMemberRepository
                .findInvitationByTokenHashForUpdate(invitation.getTokenHash())
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
        return join(locked, me);
    }

    @Override
    @Transactional
    public void declineMine(String invitationId) {
        TeamMember invitation = myInvitation(invitationId, access.currentMember());
        invitation.setStatus(TeamInvitationStatus.DECLINED);
        teamMemberRepository.save(invitation);
    }

    private TeamMember myInvitation(String invitationId, Member me) {
        return teamMemberRepository
                .findInvitationById(invitationId == null ? "" : invitationId)
                .filter(i -> i.getEmail() != null && i.getEmail().equalsIgnoreCase(me.getEmail()))
                .filter(i -> i.isUsableInvitation(LocalDateTime.now()))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_INVITATION_INVALID));
    }

    /** Dùng lời mời (đã khóa dòng): kiểm tra còn hạn, đúng email, còn chỗ theo gói, rồi thêm thành viên. */
    private TeamResponse join(TeamMember invitation, Member me) {
        LocalDateTime now = LocalDateTime.now();
        if (!invitation.isUsableInvitation(now)) {
            throw new AppException(ErrorCode.TEAM_INVITATION_INVALID);
        }
        if (invitation.getEmail() != null && !invitation.getEmail().equalsIgnoreCase(me.getEmail())) {
            throw new AppException(ErrorCode.TEAM_INVITATION_EMAIL_MISMATCH);
        }
        // Khóa team để hai người chấp nhận cùng lúc không vượt hạn mức thành viên; team đã xóa thì lời mời hết giá trị
        Team team = teamRepository
                .findByIdForUpdate(invitation.getTeam().getId())
                .filter(t -> !t.isDeleted())
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
                .kind(TeamMemberKind.MEMBER)
                .team(team)
                .member(me)
                .role(invitation.getRole())
                .joinedAt(now)
                .build());
        invitation.setStatus(TeamInvitationStatus.ACCEPTED);
        invitation.setMember(me);
        invitation.setJoinedAt(now);
        teamMemberRepository.save(invitation);

        String name = TeamAccess.displayName(me);
        activityLog.log(
                team.getId(),
                me,
                TeamActivityType.MEMBER_JOINED,
                "name",
                name,
                "role",
                invitation.getRole().name());
        notificationService.notify(
                invitation.getInvitedBy(),
                me,
                NotificationType.TEAM_MEMBER_JOINED,
                null,
                name + " đã tham gia nhóm " + team.getName(),
                NotificationService.params("name", name, "team", team.getName(), "teamId", team.getId()));
        return toResponse(team, invitation.getRole());
    }

    // ------------------------------------------------------------------------------------------------ bản nhạc

    @Override
    @Transactional(readOnly = true)
    public List<TeamScoreResponse> scores(String teamId) {
        Member me = access.currentMember();
        TeamMember mine = access.membership(teamId, me);
        boolean removeAny = access.permissions(mine).has(TeamPermission.REMOVE_SCORES);
        return scoreRepository.findByTeamWithOwner(teamId).stream()
                .map(s -> toScoreResponse(s, removeAny || isOwner(s, me)))
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
        access.require(teamId, me, TeamPermission.ADD_SCORES);
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
        // Team cũ đã xóa mềm thì bản nhạc coi như bản cá nhân, chuyển sang team khác được
        if (score.getTeamId() != null
                && teamRepository
                        .findById(score.getTeamId())
                        .filter(t -> !t.isDeleted())
                        .isPresent()) {
            throw new AppException(ErrorCode.TEAM_SCORE_IN_OTHER_TEAM);
        }
        score.setTeamId(teamId);
        scoreRepository.save(score);
        activityLog.log(teamId, me, TeamActivityType.SCORE_ADDED, "score", score.getTitle(), "scoreId", score.getId());
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
        if (!isOwner(score, me) && !access.permissions(mine).has(TeamPermission.REMOVE_SCORES)) {
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
        Page<TeamMember> result =
                teamMemberRepository.findActivities(teamId, PageRequest.of(Math.max(page, 0), safeSize));
        return PageResponse.<TeamActivityResponse>builder()
                .content(result.getContent().stream()
                        .map(a -> TeamActivityResponse.builder()
                                .id(a.getId())
                                .type(a.getType())
                                .actorName(TeamAccess.displayName(a.getMember()))
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
        Map<String, Score> scores =
                scoresById(items.stream().map(ShowItem::getScoreId).toList());
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
                        .asArranger(i.getArranger() != null
                                && i.getArranger().getId().equals(me.getId()))
                        .asReviewer(i.getReviewer() != null
                                && i.getReviewer().getId().equals(me.getId()))
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
                permissionStore.of(team.getId(), role),
                teamMemberRepository.countByTeamId(team.getId()),
                countMap(scoreRepository.countByTeams(List.of(team.getId()))).getOrDefault(team.getId(), 0L),
                countMap(showRepository.countPreparingByTeams(List.of(team.getId())))
                        .getOrDefault(team.getId(), 0L));
    }

    private TeamResponse toResponse(Team team, RolePermissions perms, long members, long scores, long shows) {
        PlanLimits limits = entitlementService.limitsOf(team.getCreatedBy().getId());
        return TeamResponse.builder()
                .id(team.getId())
                .name(team.getName())
                .description(team.getDescription())
                .avatarUrl(team.getAvatarUrl())
                .myRole(perms.role())
                .myPermissions(List.copyOf(perms.granted()))
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

    private TeamInvitationResponse toInvitationResponse(TeamMember i, String token) {
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
