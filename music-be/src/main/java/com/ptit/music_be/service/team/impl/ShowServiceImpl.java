package com.ptit.music_be.service.team.impl;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.ShowItemStatus;
import com.ptit.music_be.dto.enums.ShowStatus;
import com.ptit.music_be.dto.enums.TeamActivityType;
import com.ptit.music_be.dto.enums.TeamRole;
import com.ptit.music_be.dto.request.ShowItemOrderRequest;
import com.ptit.music_be.dto.request.ShowItemRequest;
import com.ptit.music_be.dto.request.ShowItemStatusRequest;
import com.ptit.music_be.dto.request.ShowRequest;
import com.ptit.music_be.dto.response.ShowDetailResponse;
import com.ptit.music_be.dto.response.ShowItemResponse;
import com.ptit.music_be.dto.response.RestorableItemResponse;
import com.ptit.music_be.dto.response.ShowResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.Show;
import com.ptit.music_be.entity.ShowItem;
import com.ptit.music_be.entity.Team;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.repository.ShowItemRepository;
import com.ptit.music_be.repository.ShowRepository;
import com.ptit.music_be.repository.TeamMemberRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.team.ShowItemTransitions;
import com.ptit.music_be.service.team.ShowService;
import com.ptit.music_be.service.team.TeamAccess;
import com.ptit.music_be.service.team.TeamActivityLog;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ShowServiceImpl implements ShowService {

    static final int MAX_NAME = 255;
    static final int MAX_VENUE = 255;
    static final int MAX_NOTES = 2000;
    static final int MAX_ITEM_NOTE = 500;
    static final int REMIND_DAYS_BEFORE = 2;

    ShowRepository showRepository;
    ShowItemRepository itemRepository;
    TeamMemberRepository teamMemberRepository;
    ScoreRepository scoreRepository;
    NotificationService notificationService;
    TeamAccess access;
    TeamActivityLog activityLog;

    // ------------------------------------------------------------------------------------------------ show

    @Override
    @Transactional(readOnly = true)
    public List<ShowResponse> shows(String teamId) {
        access.membership(teamId, access.currentMember());
        List<Show> shows = showRepository.findByTeamOrdered(teamId);
        Map<String, long[]> progress = progress(shows.stream().map(Show::getId).toList());
        return shows.stream()
                .map(s -> toShowResponse(s, progress.getOrDefault(s.getId(), new long[2])))
                .toList();
    }

    @Override
    @Transactional
    public ShowResponse create(String teamId, ShowRequest request) {
        Member me = access.currentMember();
        TeamMember tm = access.requireManager(teamId, me);
        Show show = Show.builder()
                .team(tm.getTeam())
                .createdBy(me)
                .status(ShowStatus.PREPARING)
                .build();
        apply(show, request);
        show = showRepository.save(show);
        activityLog.log(
                teamId, me, TeamActivityType.SHOW_CREATED, "show", show.getName(), "showId", show.getId());
        return toShowResponse(show, new long[2]);
    }

    @Override
    @Transactional(readOnly = true)
    public ShowDetailResponse get(String showId) {
        Member me = access.currentMember();
        Show show = findShow(showId);
        return detail(show, access.membership(show.getTeam().getId(), me));
    }

    @Override
    @Transactional
    public ShowResponse update(String showId, ShowRequest request) {
        Member me = access.currentMember();
        Show show = findShow(showId);
        access.requireManager(show.getTeam().getId(), me);
        apply(show, request);
        showRepository.save(show);
        activityLog.log(
                show.getTeam().getId(),
                me,
                TeamActivityType.SHOW_UPDATED,
                "show",
                show.getName(),
                "showId",
                show.getId());
        return toShowResponse(show, progress(List.of(show.getId())).getOrDefault(show.getId(), new long[2]));
    }

    @Override
    @Transactional
    public void delete(String showId) {
        Member me = access.currentMember();
        Show show = findShow(showId);
        access.requireManager(show.getTeam().getId(), me);
        // Xóa mềm: bài, phân công, trạng thái giữ nguyên để khôi phục
        show.setDeletedAt(LocalDateTime.now());
        show.setDeletedBy(me);
        showRepository.save(show);
        activityLog.log(
                show.getTeam().getId(),
                me,
                TeamActivityType.SHOW_DELETED,
                "show",
                show.getName(),
                "showId",
                show.getId());
    }

    @Override
    @Transactional(readOnly = true)
    public List<RestorableItemResponse> deletedShows(String teamId) {
        access.requireManager(teamId, access.currentMember());
        return showRepository.findDeletedByTeam(teamId, LocalDateTime.now().minusDays(Team.RESTORE_DAYS)).stream()
                .map(s -> RestorableItemResponse.builder()
                        .id(s.getId())
                        .name(s.getName())
                        .description(s.getVenue())
                        .deletedAt(s.getDeletedAt())
                        .deletedByName(TeamAccess.displayName(s.getDeletedBy()))
                        .restorableUntil(Team.restorableUntil(s.getDeletedAt()))
                        .build())
                .toList();
    }

    @Override
    @Transactional
    public ShowResponse restore(String showId) {
        Member me = access.currentMember();
        Show show = showRepository
                .findById(showId == null ? "" : showId)
                .filter(s -> s.getDeletedAt() != null)
                .orElseThrow(() -> new AppException(ErrorCode.SHOW_NOT_EXISTED));
        // requireManager đã lọc team đã xóa: team bị xóa thì phải khôi phục team trước
        access.requireManager(show.getTeam().getId(), me);
        if (!Team.restorable(show.getDeletedAt(), LocalDateTime.now())) {
            throw new AppException(ErrorCode.SHOW_RESTORE_EXPIRED);
        }
        show.setDeletedAt(null);
        show.setDeletedBy(null);
        showRepository.save(show);
        activityLog.log(
                show.getTeam().getId(),
                me,
                TeamActivityType.SHOW_RESTORED,
                "show",
                show.getName(),
                "showId",
                show.getId());
        return toShowResponse(show, progress(List.of(show.getId())).getOrDefault(show.getId(), new long[2]));
    }

    // ------------------------------------------------------------------------------------------------ bài trong show

    @Override
    @Transactional
    public ShowDetailResponse addItem(String showId, ShowItemRequest request) {
        Member me = access.currentMember();
        Show show = findShow(showId);
        String teamId = show.getTeam().getId();
        TeamMember tm = access.requireManager(teamId, me);
        String scoreId = request == null ? null : request.getScoreId();
        Score score = scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .filter(s -> teamId.equals(s.getTeamId()))
                .orElseThrow(() -> new AppException(ErrorCode.TEAM_SCORE_NOT_IN_TEAM));
        if (itemRepository.existsByShowIdAndScoreId(showId, score.getId())) {
            throw new AppException(ErrorCode.SHOW_ITEM_DUPLICATED);
        }
        List<ShowItem> items = itemRepository.findByShowOrdered(showId);
        ShowItem item = ShowItem.builder()
                .show(show)
                .scoreId(score.getId())
                .position(items.size() + 1)
                .status(ShowItemStatus.TODO)
                .build();
        assign(item, request, teamId);
        item = itemRepository.save(item);
        activityLog.log(
                teamId,
                me,
                TeamActivityType.ITEM_ADDED,
                "score",
                score.getTitle(),
                "show",
                show.getName(),
                "showId",
                showId);
        notifyAssigned(item, null, null, me, score.getTitle());
        return detail(show, tm);
    }

    @Override
    @Transactional
    public ShowDetailResponse updateItem(String showId, String itemId, ShowItemRequest request) {
        Member me = access.currentMember();
        Show show = findShow(showId);
        String teamId = show.getTeam().getId();
        TeamMember tm = access.requireManager(teamId, me);
        ShowItem item = findItem(show, itemId);
        Member oldArranger = item.getArranger();
        Member oldReviewer = item.getReviewer();
        assign(item, request, teamId);
        itemRepository.save(item);
        String title = scoreTitle(item.getScoreId());
        if (!sameMember(oldArranger, item.getArranger()) || !sameMember(oldReviewer, item.getReviewer())) {
            activityLog.log(
                    teamId,
                    me,
                    TeamActivityType.ITEM_ASSIGNED,
                    "score",
                    title,
                    "arranger",
                    TeamAccess.displayName(item.getArranger()),
                    "reviewer",
                    TeamAccess.displayName(item.getReviewer()),
                    "show",
                    show.getName(),
                    "showId",
                    showId);
        }
        notifyAssigned(item, oldArranger, oldReviewer, me, title);
        return detail(show, tm);
    }

    @Override
    @Transactional
    public ShowDetailResponse removeItem(String showId, String itemId) {
        Member me = access.currentMember();
        Show show = findShow(showId);
        TeamMember tm = access.requireManager(show.getTeam().getId(), me);
        ShowItem item = findItem(show, itemId);
        String title = scoreTitle(item.getScoreId());
        itemRepository.delete(item);
        itemRepository.flush();
        List<ShowItem> rest = itemRepository.findByShowOrdered(showId);
        for (int i = 0; i < rest.size(); i++) {
            rest.get(i).setPosition(i + 1);
        }
        itemRepository.saveAll(rest);
        activityLog.log(
                show.getTeam().getId(),
                me,
                TeamActivityType.ITEM_REMOVED,
                "score",
                title,
                "show",
                show.getName(),
                "showId",
                showId);
        return detail(show, tm);
    }

    @Override
    @Transactional
    public ShowDetailResponse reorder(String showId, ShowItemOrderRequest request) {
        Member me = access.currentMember();
        Show show = findShow(showId);
        TeamMember tm = access.requireManager(show.getTeam().getId(), me);
        List<ShowItem> items = itemRepository.findByShowOrdered(showId);
        List<String> ids = request == null || request.getItemIds() == null ? List.of() : request.getItemIds();
        Map<String, ShowItem> byId = items.stream().collect(Collectors.toMap(ShowItem::getId, Function.identity()));
        if (ids.size() != items.size() || !byId.keySet().equals(new HashSet<>(ids))) {
            throw new AppException(ErrorCode.SHOW_ORDER_INVALID);
        }
        for (int i = 0; i < ids.size(); i++) {
            byId.get(ids.get(i)).setPosition(i + 1);
        }
        itemRepository.saveAll(items);
        return detail(show, tm);
    }

    @Override
    @Transactional
    public ShowDetailResponse changeStatus(String showId, String itemId, ShowItemStatusRequest request) {
        Member me = access.currentMember();
        Show show = findShow(showId);
        TeamMember tm = access.membership(show.getTeam().getId(), me);
        ShowItem item = findItem(show, itemId);
        ShowItemStatus to = request == null ? null : request.getStatus();
        if (to == null || to == item.getStatus()) {
            return detail(show, tm);
        }
        if (!ShowItemTransitions.allowed(item, tm.getRole(), me.getId()).contains(to)) {
            throw new AppException(ErrorCode.SHOW_ITEM_TRANSITION_INVALID);
        }
        String note = request.getNote() == null || request.getNote().isBlank()
                ? null
                : request.getNote().trim();
        if (note != null && note.length() > MAX_ITEM_NOTE) {
            throw new AppException(ErrorCode.SHOW_ITEM_NOTE_REQUIRED);
        }
        if (ShowItemTransitions.isReturnByReviewer(item, tm.getRole(), me.getId(), to) && note == null) {
            throw new AppException(ErrorCode.SHOW_ITEM_NOTE_REQUIRED);
        }
        if (to == ShowItemStatus.IN_REVIEW && item.getReviewer() == null) {
            throw new AppException(ErrorCode.SHOW_ITEM_NO_REVIEWER);
        }

        ShowItemStatus from = item.getStatus();
        // Trả lại: từ chờ duyệt về đang phối kèm góp ý (người duyệt bắt buộc, quản lý thì tùy)
        boolean returned = from == ShowItemStatus.IN_REVIEW && to == ShowItemStatus.ARRANGING && note != null;
        item.setStatus(to);
        if (returned) {
            item.setReviewNote(note);
        } else if (to == ShowItemStatus.APPROVED) {
            item.setReviewNote(null);
        }
        itemRepository.save(item);

        String title = scoreTitle(item.getScoreId());
        String teamId = show.getTeam().getId();
        activityLog.log(
                teamId,
                me,
                TeamActivityType.ITEM_STATUS_CHANGED,
                "score",
                title,
                "from",
                from.name(),
                "status",
                to.name(),
                "show",
                show.getName(),
                "showId",
                showId);
        Map<String, String> params = NotificationService.params(
                "title", title, "show", show.getName(), "teamId", teamId, "showId", showId, "name",
                TeamAccess.displayName(me));
        if (to == ShowItemStatus.IN_REVIEW) {
            notificationService.notify(
                    item.getReviewer(),
                    me,
                    NotificationType.SHOW_ITEM_SUBMITTED,
                    item.getScoreId(),
                    TeamAccess.displayName(me) + " đã gửi duyệt bài “" + title + "” (buổi diễn " + show.getName() + ")",
                    params);
        } else if (to == ShowItemStatus.APPROVED) {
            notificationService.notify(
                    item.getArranger(),
                    me,
                    NotificationType.SHOW_ITEM_APPROVED,
                    item.getScoreId(),
                    "Bài “" + title + "” (buổi diễn " + show.getName() + ") đã được duyệt",
                    params);
        } else if (returned) {
            params.put("reason", note);
            notificationService.notify(
                    item.getArranger(),
                    me,
                    NotificationType.SHOW_ITEM_RETURNED,
                    item.getScoreId(),
                    "Bài “" + title + "” (buổi diễn " + show.getName() + ") bị trả lại: " + note,
                    params);
        }
        return detail(show, tm);
    }

    @Override
    @Transactional
    public int remindDue() {
        LocalDate today = LocalDate.now();
        int sent = remind(itemRepository.findDueOn(today.plusDays(REMIND_DAYS_BEFORE)), "soon");
        return sent + remind(itemRepository.findDueOn(today), "today");
    }

    private int remind(List<ShowItem> items, String variant) {
        if (items.isEmpty()) {
            return 0;
        }
        Map<String, Score> scores = scoresById(items.stream().map(ShowItem::getScoreId).toList());
        int sent = 0;
        for (ShowItem item : items) {
            Score score = scores.get(item.getScoreId());
            // Bài đang chờ duyệt thì người cần làm là người duyệt, còn lại là người phối
            Member recipient = item.getStatus() == ShowItemStatus.IN_REVIEW ? item.getReviewer() : item.getArranger();
            if (score == null || recipient == null) {
                continue;
            }
            Show show = item.getShow();
            String when = "today".equals(variant) ? "hôm nay" : "sau " + REMIND_DAYS_BEFORE + " ngày";
            notificationService.notify(
                    recipient,
                    null,
                    NotificationType.SHOW_ITEM_DUE,
                    score.getId(),
                    "Bài “" + score.getTitle() + "” (buổi diễn " + show.getName() + ") tới hạn " + when,
                    NotificationService.params(
                            "variant", variant,
                            "title", score.getTitle(),
                            "show", show.getName(),
                            "days", String.valueOf(REMIND_DAYS_BEFORE),
                            "teamId", show.getTeam().getId(),
                            "showId", show.getId()));
            sent++;
        }
        return sent;
    }

    // ------------------------------------------------------------------------------------------------ helpers

    /** Show chưa xóa; show đã xóa coi như không tồn tại. */
    private Show findShow(String showId) {
        return showRepository
                .findActiveById(showId == null ? "" : showId)
                .orElseThrow(() -> new AppException(ErrorCode.SHOW_NOT_EXISTED));
    }

    private ShowItem findItem(Show show, String itemId) {
        return itemRepository
                .findById(itemId == null ? "" : itemId)
                .filter(i -> i.getShow().getId().equals(show.getId()))
                .orElseThrow(() -> new AppException(ErrorCode.SHOW_ITEM_NOT_EXISTED));
    }

    private void apply(Show show, ShowRequest request) {
        String name = request == null ? null : blankToNull(request.getName());
        String venue = request == null ? null : blankToNull(request.getVenue());
        String notes = request == null ? null : blankToNull(request.getNotes());
        if (name == null
                || name.length() > MAX_NAME
                || (venue != null && venue.length() > MAX_VENUE)
                || (notes != null && notes.length() > MAX_NOTES)) {
            throw new AppException(ErrorCode.SHOW_INVALID);
        }
        show.setName(name);
        show.setVenue(venue);
        show.setNotes(notes);
        show.setShowDate(request.getShowDate());
        if (request.getStatus() != null) {
            show.setStatus(request.getStatus());
        }
    }

    /** Gán người phối, người duyệt (phải là thành viên team, không phải VIEWER), hạn và ghi chú. */
    private void assign(ShowItem item, ShowItemRequest request, String teamId) {
        if (request == null) {
            return;
        }
        String notes = blankToNull(request.getNotes());
        if (notes != null && notes.length() > MAX_ITEM_NOTE) {
            throw new AppException(ErrorCode.SHOW_INVALID);
        }
        item.setArranger(assignee(request.getArrangerId(), teamId));
        item.setReviewer(assignee(request.getReviewerId(), teamId));
        item.setDueDate(request.getDueDate());
        item.setNotes(notes);
    }

    private Member assignee(String memberId, String teamId) {
        if (memberId == null || memberId.isBlank()) {
            return null;
        }
        TeamMember tm = teamMemberRepository
                .findByTeamIdAndMemberId(teamId, memberId)
                .orElseThrow(() -> new AppException(ErrorCode.SHOW_ITEM_ASSIGNEE_INVALID));
        if (tm.getRole() == TeamRole.VIEWER) {
            throw new AppException(ErrorCode.SHOW_ITEM_ASSIGNEE_INVALID);
        }
        return tm.getMember();
    }

    /** Báo người mới được giao phối / duyệt (người cũ giữ nguyên thì không báo lại). */
    private void notifyAssigned(ShowItem item, Member oldArranger, Member oldReviewer, Member actor, String title) {
        Show show = item.getShow();
        String teamId = show.getTeam().getId();
        if (item.getArranger() != null && !sameMember(oldArranger, item.getArranger())) {
            notificationService.notify(
                    item.getArranger(),
                    actor,
                    NotificationType.SHOW_ITEM_ASSIGNED,
                    item.getScoreId(),
                    "Bạn được giao phối bài “" + title + "” trong buổi diễn " + show.getName(),
                    NotificationService.params(
                            "variant", "arranger", "title", title, "show", show.getName(), "teamId", teamId,
                            "showId", show.getId()));
        }
        if (item.getReviewer() != null && !sameMember(oldReviewer, item.getReviewer())) {
            notificationService.notify(
                    item.getReviewer(),
                    actor,
                    NotificationType.SHOW_ITEM_ASSIGNED,
                    item.getScoreId(),
                    "Bạn được giao duyệt bài “" + title + "” trong buổi diễn " + show.getName(),
                    NotificationService.params(
                            "variant", "reviewer", "title", title, "show", show.getName(), "teamId", teamId,
                            "showId", show.getId()));
        }
    }

    private ShowDetailResponse detail(Show show, TeamMember me) {
        List<ShowItem> items = itemRepository.findByShowOrdered(show.getId());
        Map<String, Score> scores = scoresById(items.stream().map(ShowItem::getScoreId).toList());
        String memberId = me.getMember().getId();
        // Bản nhạc đang ở thùng rác không hiện trong show (khôi phục thì hiện lại)
        List<ShowItemResponse> rows = items.stream()
                .filter(i -> scores.containsKey(i.getScoreId()))
                .map(i -> toItemResponse(i, scores.get(i.getScoreId()), me.getRole(), memberId))
                .toList();
        long approved = rows.stream().filter(r -> r.getStatus() == ShowItemStatus.APPROVED).count();
        return ShowDetailResponse.builder()
                .show(toShowResponse(show, new long[] {rows.size(), approved}))
                .teamName(show.getTeam().getName())
                .myRole(me.getRole())
                .items(rows)
                .assignees(teamMemberRepository.findByTeamWithMember(show.getTeam().getId()).stream()
                        .filter(tm -> tm.getRole() != TeamRole.VIEWER)
                        .map(TeamServiceImpl::toMemberResponse)
                        .toList())
                .build();
    }

    private static ShowItemResponse toItemResponse(ShowItem i, Score score, TeamRole role, String memberId) {
        return ShowItemResponse.builder()
                .id(i.getId())
                .scoreId(i.getScoreId())
                .scoreTitle(score.getTitle())
                .scoreComposer(score.getComposer())
                .position(i.getPosition())
                .arrangerId(i.getArranger() == null ? null : i.getArranger().getId())
                .arrangerName(TeamAccess.displayName(i.getArranger()))
                .reviewerId(i.getReviewer() == null ? null : i.getReviewer().getId())
                .reviewerName(TeamAccess.displayName(i.getReviewer()))
                .dueDate(i.getDueDate())
                .status(i.getStatus())
                .notes(i.getNotes())
                .reviewNote(i.getReviewNote())
                .allowedStatuses(ShowItemTransitions.allowed(i, role, memberId))
                .build();
    }

    private static ShowResponse toShowResponse(Show s, long[] progress) {
        return ShowResponse.builder()
                .id(s.getId())
                .teamId(s.getTeam().getId())
                .name(s.getName())
                .showDate(s.getShowDate())
                .venue(s.getVenue())
                .notes(s.getNotes())
                .status(s.getStatus())
                .itemCount(progress[0])
                .approvedCount(progress[1])
                .createdAt(s.getCreatedAt())
                .build();
    }

    /** {tổng số bài, số bài đã duyệt} của từng show, đếm thẳng từ show_items. */
    private Map<String, long[]> progress(List<String> showIds) {
        Map<String, long[]> map = new HashMap<>();
        if (showIds.isEmpty()) {
            return map;
        }
        for (Object[] r : itemRepository.progressByShows(showIds)) {
            map.put((String) r[0], new long[] {((Number) r[1]).longValue(), r[2] == null ? 0 : ((Number) r[2]).longValue()});
        }
        return map;
    }

    private Map<String, Score> scoresById(List<String> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return scoreRepository.findAllById(ids).stream().collect(Collectors.toMap(Score::getId, Function.identity()));
    }

    private String scoreTitle(String scoreId) {
        return scoreRepository.findById(scoreId).map(Score::getTitle).orElse("");
    }

    private static boolean sameMember(Member a, Member b) {
        return Objects.equals(a == null ? null : a.getId(), b == null ? null : b.getId());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
