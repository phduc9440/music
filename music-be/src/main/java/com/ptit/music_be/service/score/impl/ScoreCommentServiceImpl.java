package com.ptit.music_be.service.score.impl;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.CommentStatus;
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.ScoreAccess;
import com.ptit.music_be.dto.enums.Visibility;
import com.ptit.music_be.dto.request.ScoreCommentReplyRequest;
import com.ptit.music_be.dto.request.ScoreCommentRequest;
import com.ptit.music_be.dto.request.ScoreCommentUpdateRequest;
import com.ptit.music_be.dto.response.CommentMemberResponse;
import com.ptit.music_be.dto.response.ScoreCommentResponse;
import com.ptit.music_be.dto.response.ScoreCommentsResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberScore;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreComment;
import com.ptit.music_be.entity.ScoreCommentMention;
import com.ptit.music_be.entity.TeamMember;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.MemberScoreRepository;
import com.ptit.music_be.repository.ScoreCommentMentionRepository;
import com.ptit.music_be.repository.ScoreCommentRepository;
import com.ptit.music_be.repository.ScoreRepository;
import com.ptit.music_be.repository.TeamMemberRepository;
import com.ptit.music_be.repository.TeamRepository;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.service.permission.AccessDecision;
import com.ptit.music_be.service.permission.ScorePermissionService;
import com.ptit.music_be.service.score.ScoreCommentService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ScoreCommentServiceImpl implements ScoreCommentService {

    static final int MAX_CONTENT = 2000;
    static final int MAX_MENTIONS = 20;
    static final int MAX_NOTE_IDS = 200;
    static final int MAX_ID_LENGTH = 64;
    static final int MAX_SUGGESTIONS = 20;

    ScoreRepository scoreRepository;
    ScoreCommentRepository commentRepository;
    ScoreCommentMentionRepository mentionRepository;
    MemberRepository memberRepository;
    MemberScoreRepository memberScoreRepository;
    TeamRepository teamRepository;
    TeamMemberRepository teamMemberRepository;
    ScorePermissionService permissionService;
    NotificationService notificationService;
    ObjectMapper objectMapper;

    // ------------------------------------------------------------------------------------------------ đọc

    @Override
    @Transactional(readOnly = true)
    public ScoreCommentsResponse list(String scoreId, CommentStatus status, boolean mentioned) {
        Score score = findScore(scoreId);
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.VIEW)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        permissionService.auditModeratorAccess(score, "COMMENTS");
        Member me = currentMember();

        List<ScoreComment> roots = commentRepository.findRootsOfScore(score.getId());
        Set<String> mentioningMe = new HashSet<>(mentionRepository.findThreadIdsMentioning(score.getId(), me.getId()));
        // Số đếm tính từ danh sách vừa nạp (không lưu bảng thống kê)
        long open = roots.stream().filter(c -> c.getStatus() != CommentStatus.RESOLVED).count();
        long resolved = roots.size() - open;
        long mentionedCount = roots.stream().filter(c -> mentioningMe.contains(c.getId())).count();

        List<ScoreComment> shown = roots.stream()
                .filter(c -> mentioned
                        ? mentioningMe.contains(c.getId())
                        : status == null || effectiveStatus(c) == status)
                .toList();
        return ScoreCommentsResponse.builder()
                .canComment(canWrite(score, decision))
                .measureCount(score.getMeasureCount())
                .currentVersion(score.getCurrentVersion())
                .openCount(open)
                .resolvedCount(resolved)
                .mentionedCount(mentionedCount)
                .comments(toThreads(shown, score, decision, me))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CommentMemberResponse> mentionable(String scoreId, String keyword) {
        Score score = findScore(scoreId);
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.REVIEW)) {
            throw new AppException(ErrorCode.COMMENT_WRITE_FORBIDDEN);
        }
        Member me = currentMember();
        String kw = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        return mentionableMembers(score).values().stream()
                .filter(m -> !m.getId().equals(me.getId()))
                .filter(m -> kw.isEmpty()
                        || displayName(m).toLowerCase(Locale.ROOT).contains(kw)
                        || (m.getEmail() != null && m.getEmail().toLowerCase(Locale.ROOT).startsWith(kw)))
                .limit(MAX_SUGGESTIONS)
                .map(ScoreCommentServiceImpl::toMember)
                .toList();
    }

    // ------------------------------------------------------------------------------------------------ ghi

    @Override
    @Transactional
    public ScoreCommentResponse create(String scoreId, ScoreCommentRequest request) {
        Score score = findScore(scoreId);
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.REVIEW)) {
            throw new AppException(ErrorCode.COMMENT_WRITE_FORBIDDEN);
        }
        Member me = currentMember();
        String content = cleanContent(request.getContent());

        Integer measureCount = score.getMeasureCount();
        Integer start = request.getStartMeasure();
        Integer end = request.getEndMeasure() == null ? start : request.getEndMeasure();
        if (measureCount == null || measureCount < 1 || start == null || start < 1 || end < start || end > measureCount) {
            throw new AppException(ErrorCode.COMMENT_MEASURE_INVALID);
        }
        Map<String, Member> mentions = resolveMentions(score, me, request.getMentionIds());

        ScoreComment comment = commentRepository.save(ScoreComment.builder()
                .score(score)
                .author(me)
                .content(content)
                .startMeasure(start)
                .endMeasure(end)
                .partId(cleanPartId(request.getPartId()))
                .noteIds(noteIdsJson(request.getNoteIds()))
                .scoreVersion(score.getCurrentVersion())
                .measureCountAt(measureCount)
                .status(CommentStatus.OPEN)
                .build());
        saveMentions(comment, mentions.values());
        notifyMentions(mentions.values(), me, score, comment);
        return thread(comment, score, decision, me);
    }

    @Override
    @Transactional
    public ScoreCommentResponse reply(String commentId, ScoreCommentReplyRequest request) {
        ScoreComment target = findComment(commentId);
        ScoreComment root = rootOf(target);
        Score score = findScore(root.getScore().getId());
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.REVIEW)) {
            throw new AppException(ErrorCode.COMMENT_WRITE_FORBIDDEN);
        }
        Member me = currentMember();
        String content = cleanContent(request.getContent());
        Map<String, Member> mentions = resolveMentions(score, me, request.getMentionIds());

        // Người cần báo "có trả lời": người viết góp ý gốc và những người đã trả lời trước (trừ người đang trả lời)
        Map<String, Member> participants = new LinkedHashMap<>();
        participants.put(root.getAuthor().getId(), root.getAuthor());
        for (ScoreComment r : commentRepository.findRepliesOf(root.getId())) {
            participants.putIfAbsent(r.getAuthor().getId(), r.getAuthor());
        }

        ScoreComment reply = commentRepository.save(ScoreComment.builder()
                .score(score)
                .parent(root)
                .author(me)
                .content(content)
                .build());
        saveMentions(reply, mentions.values());
        notifyMentions(mentions.values(), me, score, root);
        String name = displayName(me);
        for (Member p : participants.values()) {
            // Người vừa được @nhắc đã nhận thông báo nhắc tên, không báo thêm lần nữa
            if (p.getId().equals(me.getId()) || mentions.containsKey(p.getId())) {
                continue;
            }
            notificationService.notify(
                    p,
                    me,
                    NotificationType.COMMENT_REPLY,
                    score.getId(),
                    name + " đã trả lời góp ý ở ô " + measures(root) + " của “" + score.getTitle() + "”",
                    NotificationService.params(
                            "name", name, "title", score.getTitle(), "measures", measures(root), "commentId",
                            root.getId()));
        }
        return thread(root, score, decision, me);
    }

    @Override
    @Transactional
    public ScoreCommentResponse update(String commentId, ScoreCommentUpdateRequest request) {
        ScoreComment comment = findComment(commentId);
        ScoreComment root = rootOf(comment);
        Score score = findScore(root.getScore().getId());
        AccessDecision decision = permissionService.resolve(score);
        if (!decision.can(ScoreAccess.VIEW)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        Member me = currentMember();
        boolean author = comment.getAuthor().getId().equals(me.getId());

        if (request.getContent() != null || request.getMentionIds() != null) {
            if (!author || !decision.can(ScoreAccess.REVIEW)) {
                throw new AppException(ErrorCode.COMMENT_FORBIDDEN);
            }
            if (request.getContent() != null) {
                String content = cleanContent(request.getContent());
                if (!content.equals(comment.getContent())) {
                    comment.setContent(content);
                    comment.setEditedAt(LocalDateTime.now());
                }
            }
            if (request.getMentionIds() != null) {
                Map<String, Member> mentions = resolveMentions(score, me, request.getMentionIds());
                Set<String> before = mentionRepository.findByCommentIds(List.of(comment.getId())).stream()
                        .map(m -> m.getMember().getId())
                        .collect(Collectors.toSet());
                mentionRepository.deleteByCommentId(comment.getId());
                mentionRepository.flush();
                saveMentions(comment, mentions.values());
                // Chỉ người mới được thêm nhận thông báo
                notifyMentions(
                        mentions.values().stream().filter(m -> !before.contains(m.getId())).toList(),
                        me,
                        score,
                        root);
            }
        }

        if (request.getStatus() != null) {
            if (!comment.isRoot() || !canResolve(comment, me, decision)) {
                throw new AppException(ErrorCode.COMMENT_FORBIDDEN);
            }
            if (request.getStatus() == CommentStatus.RESOLVED) {
                if (comment.getStatus() != CommentStatus.RESOLVED) {
                    comment.setStatus(CommentStatus.RESOLVED);
                    comment.setResolvedBy(me);
                    comment.setResolvedAt(LocalDateTime.now());
                }
            } else {
                comment.setStatus(CommentStatus.OPEN);
                comment.setResolvedBy(null);
                comment.setResolvedAt(null);
            }
        }
        commentRepository.save(comment);
        return thread(root, score, decision, me);
    }

    @Override
    @Transactional
    public void delete(String commentId) {
        ScoreComment comment = findComment(commentId);
        Score score = findScore(comment.getScore().getId());
        AccessDecision decision = permissionService.resolve(score);
        Member me = currentMember();
        if (!canDelete(comment, me, decision)) {
            throw new AppException(ErrorCode.COMMENT_FORBIDDEN);
        }
        commentRepository.deleteDirectly(comment.getId());
    }

    // ------------------------------------------------------------------------------------------------ quyền

    /** Viết được nếu có REVIEW trở lên và bản nhạc đã có ô nhịp để neo góp ý. */
    private static boolean canWrite(Score score, AccessDecision decision) {
        return decision.can(ScoreAccess.REVIEW) && score.getMeasureCount() != null && score.getMeasureCount() > 0;
    }

    private static boolean canResolve(ScoreComment root, Member me, AccessDecision decision) {
        return root.getAuthor().getId().equals(me.getId()) || decision.can(ScoreAccess.EDIT);
    }

    private static boolean canDelete(ScoreComment comment, Member me, AccessDecision decision) {
        return comment.getAuthor().getId().equals(me.getId()) || decision.level() == ScoreAccess.OWNER;
    }

    /**
     * Người xem được bản nhạc để gợi ý / kiểm tra @nhắc tên: chủ, người đã được cấp quyền chia sẻ, thành viên team còn hoạt
     * động; bản công khai thêm những người đã góp ý trên bản. Bỏ tài khoản đang bị khóa.
     */
    private Map<String, Member> mentionableMembers(Score score) {
        Map<String, Member> result = new LinkedHashMap<>();
        if (score.getMember() != null) {
            result.put(score.getMember().getId(), score.getMember());
        }
        for (MemberScore share : memberScoreRepository.findByScoreIdFetchMember(score.getId())) {
            result.putIfAbsent(share.getMember().getId(), share.getMember());
        }
        if (score.getTeamId() != null
                && teamRepository.findById(score.getTeamId()).filter(t -> !t.isDeleted()).isPresent()) {
            for (TeamMember tm : teamMemberRepository.findByTeamWithMember(score.getTeamId())) {
                result.putIfAbsent(tm.getMember().getId(), tm.getMember());
            }
        }
        if (Visibility.PUBLIC.name().equals(score.getVisibility())) {
            List<String> missing = commentRepository.findAuthorIdsOfScore(score.getId()).stream()
                    .filter(id -> !result.containsKey(id))
                    .toList();
            memberRepository.findAllById(missing).forEach(m -> result.putIfAbsent(m.getId(), m));
        }
        result.values().removeIf(m -> m.getStatus() != null && m.getStatus() != MemberStatus.ACTIVE);
        return result;
    }

    /** Kiểm tra danh sách @nhắc tên; tự nhắc chính mình thì bỏ qua. */
    private Map<String, Member> resolveMentions(Score score, Member me, List<String> mentionIds) {
        if (mentionIds == null || mentionIds.isEmpty()) {
            return Map.of();
        }
        Set<String> ids = mentionIds.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(id -> !id.isEmpty() && !id.equals(me.getId()))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (ids.size() > MAX_MENTIONS) {
            throw new AppException(ErrorCode.COMMENT_MENTION_INVALID);
        }
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<String, Member> allowed = mentionableMembers(score);
        Map<String, Member> result = new LinkedHashMap<>();
        for (String id : ids) {
            Member m = allowed.get(id);
            if (m == null) {
                throw new AppException(ErrorCode.COMMENT_MENTION_INVALID);
            }
            result.put(id, m);
        }
        return result;
    }

    // ------------------------------------------------------------------------------------------------ thông báo

    private void saveMentions(ScoreComment comment, Collection<Member> members) {
        for (Member m : members) {
            mentionRepository.save(ScoreCommentMention.builder().comment(comment).member(m).build());
        }
    }

    private void notifyMentions(Collection<Member> members, Member actor, Score score, ScoreComment root) {
        String name = displayName(actor);
        for (Member m : members) {
            notificationService.notify(
                    m,
                    actor,
                    NotificationType.COMMENT_MENTION,
                    score.getId(),
                    name + " đã nhắc tới bạn trong góp ý ở ô " + measures(root) + " của “" + score.getTitle() + "”",
                    NotificationService.params(
                            "name", name, "title", score.getTitle(), "measures", measures(root), "commentId",
                            root.getId()));
        }
    }

    /** "12" hoặc "12–16" (dùng chung cho câu thông báo tiếng Việt và tham số để web dựng câu). */
    static String measures(ScoreComment root) {
        Integer s = root.getStartMeasure();
        Integer e = root.getEndMeasure();
        if (s == null) {
            return "";
        }
        return e == null || e.equals(s) ? String.valueOf(s) : s + "–" + e;
    }

    // ------------------------------------------------------------------------------------------------ dựng phản hồi

    private ScoreCommentResponse thread(ScoreComment root, Score score, AccessDecision decision, Member me) {
        return toThreads(List.of(root), score, decision, me).get(0);
    }

    private List<ScoreCommentResponse> toThreads(
            List<ScoreComment> roots, Score score, AccessDecision decision, Member me) {
        if (roots.isEmpty()) {
            return List.of();
        }
        List<String> rootIds = roots.stream().map(ScoreComment::getId).toList();
        Map<String, List<ScoreComment>> repliesByRoot = commentRepository.findRepliesOf(rootIds).stream()
                .collect(Collectors.groupingBy(r -> r.getParent().getId(), LinkedHashMap::new, Collectors.toList()));
        List<String> allIds = new ArrayList<>(rootIds);
        repliesByRoot.values().forEach(list -> list.forEach(r -> allIds.add(r.getId())));
        Map<String, List<CommentMemberResponse>> mentionsByComment = mentionRepository.findByCommentIds(allIds).stream()
                .collect(Collectors.groupingBy(
                        m -> m.getComment().getId(),
                        Collectors.mapping(m -> toMember(m.getMember()), Collectors.toList())));

        List<ScoreCommentResponse> result = new ArrayList<>();
        for (ScoreComment root : roots) {
            List<ScoreCommentResponse> replies = repliesByRoot.getOrDefault(root.getId(), List.of()).stream()
                    .map(r -> base(r, mentionsByComment, decision, me).build())
                    .toList();
            boolean outdated = root.getMeasureCountAt() != null
                    && score.getMeasureCount() != null
                    && !root.getMeasureCountAt().equals(score.getMeasureCount());
            result.add(base(root, mentionsByComment, decision, me)
                    .startMeasure(root.getStartMeasure())
                    .endMeasure(root.getEndMeasure())
                    .partId(root.getPartId())
                    .noteIds(parseNoteIds(root.getNoteIds()))
                    .scoreVersion(root.getScoreVersion())
                    .outdated(outdated)
                    .status(effectiveStatus(root))
                    .resolvedBy(root.getResolvedBy() == null ? null : toMember(root.getResolvedBy()))
                    .resolvedAt(root.getResolvedAt())
                    .replies(replies)
                    .canResolve(canResolve(root, me, decision))
                    .build());
        }
        return result;
    }

    private static ScoreCommentResponse.ScoreCommentResponseBuilder base(
            ScoreComment c, Map<String, List<CommentMemberResponse>> mentions, AccessDecision decision, Member me) {
        boolean author = c.getAuthor().getId().equals(me.getId());
        return ScoreCommentResponse.builder()
                .id(c.getId())
                .scoreId(c.getScore().getId())
                .parentId(c.isRoot() ? null : c.getParent().getId())
                .author(toMember(c.getAuthor()))
                .content(c.getContent())
                .mentions(mentions.getOrDefault(c.getId(), List.of()))
                .createdAt(c.getCreatedAt())
                .editedAt(c.getEditedAt())
                .canEdit(author && decision.can(ScoreAccess.REVIEW))
                .canDelete(canDelete(c, me, decision));
    }

    private static CommentStatus effectiveStatus(ScoreComment root) {
        return root.getStatus() == null ? CommentStatus.OPEN : root.getStatus();
    }

    private static CommentMemberResponse toMember(Member m) {
        return CommentMemberResponse.builder()
                .id(m.getId())
                .name(displayName(m))
                .avatarUrl(m.getAvatarUrl())
                .build();
    }

    static String displayName(Member m) {
        return m.getFullName() == null || m.getFullName().isBlank() ? m.getEmail() : m.getFullName();
    }

    // ------------------------------------------------------------------------------------------------ kiểm tra dữ liệu

    private static String cleanContent(String content) {
        String c = content == null ? "" : content.strip();
        if (c.isEmpty() || c.length() > MAX_CONTENT) {
            throw new AppException(ErrorCode.COMMENT_CONTENT_INVALID);
        }
        return c;
    }

    private static String cleanPartId(String partId) {
        if (partId == null || partId.isBlank()) {
            return null;
        }
        String p = partId.trim();
        if (p.length() > MAX_ID_LENGTH) {
            throw new AppException(ErrorCode.COMMENT_ANCHOR_INVALID);
        }
        return p;
    }

    private String noteIdsJson(List<String> noteIds) {
        if (noteIds == null || noteIds.isEmpty()) {
            return null;
        }
        List<String> ids = noteIds.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(id -> !id.isEmpty())
                .distinct()
                .toList();
        if (ids.size() > MAX_NOTE_IDS || ids.stream().anyMatch(id -> id.length() > MAX_ID_LENGTH)) {
            throw new AppException(ErrorCode.COMMENT_ANCHOR_INVALID);
        }
        try {
            return ids.isEmpty() ? null : objectMapper.writeValueAsString(ids);
        } catch (JsonProcessingException e) {
            throw new AppException(ErrorCode.COMMENT_ANCHOR_INVALID);
        }
    }

    private List<String> parseNoteIds(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------------------------------------ tra cứu

    private Score findScore(String scoreId) {
        return scoreRepository
                .findById(scoreId == null ? "" : scoreId)
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
    }

    private ScoreComment findComment(String commentId) {
        return commentRepository
                .findById(commentId == null ? "" : commentId)
                .orElseThrow(() -> new AppException(ErrorCode.COMMENT_NOT_EXISTED));
    }

    private ScoreComment rootOf(ScoreComment comment) {
        return comment.isRoot() ? comment : comment.getParent();
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }
}
