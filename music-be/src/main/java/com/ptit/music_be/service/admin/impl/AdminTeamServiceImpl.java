package com.ptit.music_be.service.admin.impl;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.response.admin.AdminTeamDetailResponse;
import com.ptit.music_be.dto.response.admin.AdminTeamResponse;
import com.ptit.music_be.dto.response.admin.AdminTeamSummaryResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.team.ShowResponse;
import com.ptit.music_be.dto.response.team.TeamActivityResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Show;
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
import com.ptit.music_be.service.admin.AdminTeamService;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.team.TeamAccess;
import com.ptit.music_be.service.team.TeamActivityLog;
import com.ptit.music_be.service.team.impl.TeamServiceImpl;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

/**
 * Số đếm tính bằng JPQL trên các bảng team ngay lúc xem (không có bảng thống kê). Admin chỉ thấy siêu dữ liệu (tên, người,
 * trạng thái), không được cộng quyền nào trên bản nhạc của team.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@PreAuthorize("@perm.has('TEAMS_MANAGE')")
public class AdminTeamServiceImpl implements AdminTeamService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;
    static final int MAX_KEYWORD = 100;
    static final int MAX_REASON = 500;
    static final int ACTIVE_DAYS = 7;
    static final int DETAIL_SCORES = 100;
    static final int DETAIL_ACTIVITIES = 20;

    /** Cột: id, tên, mô tả, ngày tạo, id/tên/email người tạo, số thành viên, bản nhạc, show, show đang chuẩn bị, hoạt động gần nhất. */
    static final String ROW_SELECT = "select t.id, t.name, t.description, t.createdAt, c.id, c.fullName, c.email,"
            + " (select count(tm) from TeamMember tm where tm.team = t and tm.kind = 'MEMBER'),"
            + " (select count(s) from Score s where s.teamId = t.id),"
            + " (select count(sh) from Show sh where sh.team = t and sh.deletedAt is null),"
            + " (select count(sp) from Show sp where sp.team = t and sp.status = 'PREPARING' and sp.deletedAt is null),"
            + " (select max(a.createdAt) from TeamMember a where a.team = t and a.kind = 'ACTIVITY'),"
            + " t.deletedAt, t.deletedByAdmin, t.deletedReason"
            + " from Team t join t.createdBy c";
    static final String KEYWORD_FILTER = " where (:kw is null or lower(t.name) like :kw or lower(c.email) like :kw"
            + " or lower(c.fullName) like :kw)";
    static final String ACTIVE_FILTER = " and t.deletedAt is null";
    static final String DELETED_FILTER = " and t.deletedAt is not null";

    @PersistenceContext
    EntityManager em;

    TeamRepository teamRepository;
    TeamMemberRepository teamMemberRepository;
    ShowRepository showRepository;
    ShowItemRepository showItemRepository;
    ScoreRepository scoreRepository;
    MemberRepository memberRepository;
    EntitlementService entitlementService;
    NotificationService notificationService;
    TeamActivityLog activityLog;
    TeamServiceImpl teamService;

    @Override
    @Transactional(readOnly = true)
    public AdminTeamSummaryResponse summary() {
        LocalDateTime now = LocalDateTime.now();
        return AdminTeamSummaryResponse.builder()
                .teams(count("select count(t) from Team t where t.deletedAt is null"))
                .activeTeams7d(em.createQuery(
                                "select count(distinct a.team.id) from TeamMember a where a.kind = 'ACTIVITY'"
                                        + " and a.team.deletedAt is null and a.createdAt >= :since",
                                Long.class)
                        .setParameter("since", now.minusDays(ACTIVE_DAYS))
                        .getSingleResult())
                .teamMembers(count("select count(distinct tm.member) from TeamMember tm where tm.kind = 'MEMBER'"
                        + " and tm.team.deletedAt is null"))
                .preparingShows(count("select count(s) from Show s where s.status = 'PREPARING'"
                        + " and s.deletedAt is null and s.team.deletedAt is null"))
                .openItems(count("select count(i) from ShowItem i where i.status <> 'APPROVED'"
                        + " and i.show.status = 'PREPARING' and i.show.deletedAt is null"
                        + " and i.show.team.deletedAt is null"))
                .overdueItems(em.createQuery(
                                "select count(i) from ShowItem i where i.status <> 'APPROVED'"
                                        + " and i.show.status = 'PREPARING' and i.show.deletedAt is null"
                                        + " and i.show.team.deletedAt is null and i.dueDate < :today",
                                Long.class)
                        .setParameter("today", LocalDate.now())
                        .getSingleResult())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AdminTeamResponse> search(String keyword, boolean deleted, int page, int size) {
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        String kw = keyword == null || keyword.isBlank()
                ? null
                : "%" + keyword.trim().toLowerCase(Locale.ROOT).substring(0, Math.min(keyword.trim().length(), MAX_KEYWORD))
                        + "%";
        String state = deleted ? DELETED_FILTER : ACTIVE_FILTER;
        String order = deleted ? " order by t.deletedAt desc, t.id" : " order by t.createdAt desc, t.id";
        long total = em.createQuery("select count(t) from Team t join t.createdBy c" + KEYWORD_FILTER + state, Long.class)
                .setParameter("kw", kw)
                .getSingleResult();
        List<Object[]> rows = em.createQuery(
                        ROW_SELECT + KEYWORD_FILTER + state + order, Object[].class)
                .setParameter("kw", kw)
                .setFirstResult(safePage * safeSize)
                .setMaxResults(safeSize)
                .getResultList();
        Map<String, PlanLimits> limitsByCreator = new HashMap<>();
        return PageResponse.<AdminTeamResponse>builder()
                .content(rows.stream().map(r -> toRow(r, limitsByCreator)).toList())
                .pageNumber(safePage)
                .pageSize(safeSize)
                .totalElements(total)
                .totalPages((int) ((total + safeSize - 1) / safeSize))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public AdminTeamDetailResponse detail(String teamId) {
        List<Object[]> rows = em.createQuery(ROW_SELECT + " where t.id = :id", Object[].class)
                .setParameter("id", teamId == null ? "" : teamId)
                .getResultList();
        if (rows.isEmpty()) {
            throw new AppException(ErrorCode.TEAM_NOT_EXISTED);
        }
        AdminTeamResponse team = toRow(rows.get(0), new HashMap<>());

        List<Show> shows = showRepository.findByTeamOrdered(team.getId());
        Map<String, long[]> progress = new HashMap<>();
        if (!shows.isEmpty()) {
            for (Object[] r : showItemRepository.progressByShows(shows.stream().map(Show::getId).toList())) {
                progress.put((String) r[0], new long[] {
                    ((Number) r[1]).longValue(), r[2] == null ? 0 : ((Number) r[2]).longValue()
                });
            }
        }
        return AdminTeamDetailResponse.builder()
                .team(team)
                .members(teamMemberRepository.findByTeamWithMember(team.getId()).stream()
                        .map(TeamServiceImpl::toMemberResponse)
                        .toList())
                .shows(shows.stream()
                        .map(s -> {
                            long[] p = progress.getOrDefault(s.getId(), new long[2]);
                            return ShowResponse.builder()
                                    .id(s.getId())
                                    .teamId(team.getId())
                                    .name(s.getName())
                                    .showDate(s.getShowDate())
                                    .venue(s.getVenue())
                                    .notes(s.getNotes())
                                    .status(s.getStatus())
                                    .itemCount(p[0])
                                    .approvedCount(p[1])
                                    .createdAt(s.getCreatedAt())
                                    .build();
                        })
                        .toList())
                .scores(scoreRepository.findByTeamWithOwner(team.getId()).stream()
                        .limit(DETAIL_SCORES)
                        .map(s -> new AdminTeamDetailResponse.TeamScoreRow(
                                s.getId(),
                                s.getTitle(),
                                TeamAccess.displayName(s.getMember()),
                                s.getVisibility(),
                                s.getUpdatedAt()))
                        .toList())
                .recentActivities(
                        teamMemberRepository.findActivities(team.getId(), PageRequest.of(0, DETAIL_ACTIVITIES)).stream()
                                .map(a -> TeamActivityResponse.builder()
                                        .id(a.getId())
                                        .type(a.getType())
                                        .actorName(TeamAccess.displayName(a.getMember()))
                                        .params(activityLog.paramsOf(a))
                                        .createdAt(a.getCreatedAt())
                                        .build())
                                .toList())
                .build();
    }

    @Override
    @Transactional
    public void delete(String teamId, String reason) {
        Team team = teamRepository
                .findById(teamId == null ? "" : teamId)
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_NOT_EXISTED));
        Member admin = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        String cleanReason = reason == null || reason.isBlank()
                ? null
                : reason.trim().substring(0, Math.min(reason.trim().length(), MAX_REASON));
        List<Member> members = teamMemberRepository.findByTeamWithMember(team.getId()).stream()
                .map(TeamMember::getMember)
                .toList();
        String name = team.getName();
        String deletedId = team.getId();
        if (team.isDeleted()) {
            throw new AppException(ErrorCode.TEAM_NOT_EXISTED);
        }
        // Xóa mềm: dữ liệu giữ nguyên, khôi phục được trong 30 ngày
        team.markDeleted(admin, true, cleanReason);
        teamRepository.save(team);
        for (Member m : members) {
            notificationService.notify(
                    m,
                    admin,
                    NotificationType.TEAM_DELETED_BY_ADMIN,
                    null,
                    "Quản trị viên đã xóa nhóm " + name + (cleanReason == null ? "" : ": " + cleanReason),
                    NotificationService.params("team", name, "reason", cleanReason));
        }
        log.info("Admin {} đã xóa mềm team {} ({}), lý do: {}", admin.getEmail(), deletedId, name, cleanReason);
    }

    @Override
    @Transactional
    public void restore(String teamId) {
        Team team = teamRepository
                .findById(teamId == null ? "" : teamId)
                .filter(Team::isDeleted)
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_NOT_EXISTED));
        Member admin = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        teamService.restoreTeam(team, admin, true);
        log.info("Admin {} đã khôi phục team {} ({})", admin.getEmail(), team.getId(), team.getName());
    }

    private long count(String jpql) {
        return em.createQuery(jpql, Long.class).getSingleResult();
    }

    /** Gói của người tạo tra một lần cho mỗi người (một người tạo nhiều team thì không tra lại). */
    private AdminTeamResponse toRow(Object[] r, Map<String, PlanLimits> limitsByCreator) {
        String creatorId = (String) r[4];
        PlanLimits limits = limitsByCreator.computeIfAbsent(creatorId, entitlementService::limitsOf);
        return AdminTeamResponse.builder()
                .id((String) r[0])
                .name((String) r[1])
                .description((String) r[2])
                .createdAt((LocalDateTime) r[3])
                .creatorId(creatorId)
                .creatorName(r[5] == null || ((String) r[5]).isBlank() ? (String) r[6] : (String) r[5])
                .creatorEmail((String) r[6])
                .memberCount(((Number) r[7]).longValue())
                .scoreCount(((Number) r[8]).longValue())
                .showCount(((Number) r[9]).longValue())
                .preparingShows(((Number) r[10]).longValue())
                .lastActivityAt((LocalDateTime) r[11])
                .planActive(Boolean.TRUE.equals(limits.team()))
                .memberLimit(limits.teamMembers())
                .deletedAt((LocalDateTime) r[12])
                .restorableUntil(Team.restorableUntil((LocalDateTime) r[12]))
                .restorable(Team.restorable((LocalDateTime) r[12], LocalDateTime.now()))
                .deletedByAdmin(Boolean.TRUE.equals(r[13]))
                .deletedReason((String) r[14])
                .build();
    }
}
