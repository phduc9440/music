package com.ptit.music_be.service.report.impl;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.dto.enums.report.ReportAction;
import com.ptit.music_be.dto.enums.report.ReportReason;
import com.ptit.music_be.dto.enums.report.ReportStatus;
import com.ptit.music_be.dto.enums.report.ReportTargetType;
import com.ptit.music_be.dto.enums.score.Visibility;
import com.ptit.music_be.dto.request.admin.AdminUpdateMemberRequest;
import com.ptit.music_be.dto.request.report.ReportRequest;
import com.ptit.music_be.dto.request.report.ResolveReportRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.report.ReportResponse;
import com.ptit.music_be.entity.ContentReport;
import com.ptit.music_be.entity.ForumPost;
import com.ptit.music_be.entity.ForumThread;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreComment;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.forum.ForumPostRepository;
import com.ptit.music_be.repository.forum.ForumThreadRepository;
import com.ptit.music_be.repository.report.ContentReportRepository;
import com.ptit.music_be.repository.score.ScoreCommentRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.admin.AdminMemberService;
import com.ptit.music_be.service.report.ContentReportService;
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.score.ScoreService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ContentReportServiceImpl implements ContentReportService {

    static final int MAX_DETAILS = 1000;
    static final int MAX_NOTE = 500;
    /** Một người báo cáo tối đa chừng này lần trong 24 giờ, để không bị dùng làm công cụ quấy rối. */
    static final int MAX_REPORTS_PER_DAY = 20;
    static final int MAX_PAGE_SIZE = 100;

    ContentReportRepository reportRepository;
    ScoreRepository scoreRepository;
    ScoreCommentRepository commentRepository;
    MemberRepository memberRepository;
    ForumThreadRepository forumThreadRepository;
    ForumPostRepository forumPostRepository;
    ScoreFileService scoreFileService;
    ScoreService scoreService;
    AdminMemberService adminMemberService;
    EntityManager entityManager;

    // ------------------------------------------------------------------ người dùng báo cáo

    @Override
    @Transactional
    public void reportScore(String scoreId, ReportRequest request) {
        Score score = scoreRepository.findById(scoreId).orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);
        Member me = currentMember();
        Member owner = score.getMember();
        if (owner != null && owner.getId().equals(me.getId())) {
            throw new AppException(ErrorCode.REPORT_OWN_CONTENT);
        }
        ValidRequest valid = validate(request);
        guard(me, reportRepository.existsByReporterIdAndScoreIdAndStatus(me.getId(), scoreId, ReportStatus.PENDING));
        reportRepository.save(ContentReport.builder()
                .targetType(ReportTargetType.SCORE)
                .score(score)
                .reporter(me)
                .reason(valid.reason())
                .details(valid.details())
                .status(ReportStatus.PENDING)
                .build());
    }

    @Override
    @Transactional
    public void reportComment(String commentId, ReportRequest request) {
        ScoreComment comment = commentRepository
                .findById(commentId)
                .orElseThrow(() -> new AppException(ErrorCode.COMMENT_NOT_EXISTED));
        Score score = scoreRepository
                .findById(comment.getScore().getId())
                .orElseThrow(() -> new AppException(ErrorCode.SCORE_NOT_EXISTED));
        scoreFileService.checkCanView(score);
        Member me = currentMember();
        Member author = comment.getAuthor();
        if (author != null && author.getId().equals(me.getId())) {
            throw new AppException(ErrorCode.REPORT_OWN_CONTENT);
        }
        ValidRequest valid = validate(request);
        guard(me, reportRepository.existsByReporterIdAndCommentIdAndStatus(me.getId(), commentId, ReportStatus.PENDING));
        reportRepository.save(ContentReport.builder()
                .targetType(ReportTargetType.COMMENT)
                .comment(comment)
                .score(score)
                .reporter(me)
                .reason(valid.reason())
                .details(valid.details())
                .status(ReportStatus.PENDING)
                .build());
    }

    @Override
    @Transactional
    public void reportForumThread(String threadId, ReportRequest request) {
        ForumThread thread = forumThreadRepository
                .findById(threadId)
                .orElseThrow(() -> new AppException(ErrorCode.FORUM_THREAD_NOT_EXISTED));
        Member me = currentMember();
        if (thread.getAuthor() != null && thread.getAuthor().getId().equals(me.getId())) {
            throw new AppException(ErrorCode.REPORT_OWN_CONTENT);
        }
        ValidRequest valid = validate(request);
        guard(me, reportRepository.existsByReporterIdAndForumThreadIdAndStatus(me.getId(), threadId, ReportStatus.PENDING));
        reportRepository.save(ContentReport.builder()
                .targetType(ReportTargetType.FORUM_THREAD)
                .forumThread(thread)
                .reporter(me)
                .reason(valid.reason())
                .details(valid.details())
                .status(ReportStatus.PENDING)
                .build());
    }

    @Override
    @Transactional
    public void reportForumPost(String postId, ReportRequest request) {
        ForumPost post = forumPostRepository
                .findById(postId)
                .orElseThrow(() -> new AppException(ErrorCode.FORUM_POST_NOT_EXISTED));
        // Chủ đề chứa bài đã bị ẩn thì bài cũng coi như không còn
        ForumThread thread = forumThreadRepository
                .findById(post.getThread().getId())
                .orElseThrow(() -> new AppException(ErrorCode.FORUM_POST_NOT_EXISTED));
        Member me = currentMember();
        if (post.getAuthor() != null && post.getAuthor().getId().equals(me.getId())) {
            throw new AppException(ErrorCode.REPORT_OWN_CONTENT);
        }
        ValidRequest valid = validate(request);
        guard(me, reportRepository.existsByReporterIdAndForumPostIdAndStatus(me.getId(), postId, ReportStatus.PENDING));
        reportRepository.save(ContentReport.builder()
                .targetType(ReportTargetType.FORUM_POST)
                .forumPost(post)
                .forumThread(thread)
                .reporter(me)
                .reason(valid.reason())
                .details(valid.details())
                .status(ReportStatus.PENDING)
                .build());
    }

    // ------------------------------------------------------------------ hàng chờ của admin

    @Override
    @Transactional(readOnly = true)
    public PageResponse<ReportResponse> list(int page, int size, ReportStatus status, ReportTargetType targetType) {
        SecurityUtils.requirePermission(AdminPermission.REPORTS_MODERATE);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);

        StringBuilder where = new StringBuilder(" where 1 = 1");
        Map<String, Object> params = new HashMap<>();
        if (status != null) {
            where.append(" and r.status = :status");
            params.put("status", status);
        }
        if (targetType != null) {
            where.append(" and r.targetType = :targetType");
            params.put("targetType", targetType);
        }
        TypedQuery<Long> count = entityManager.createQuery("select count(r) from ContentReport r" + where, Long.class);
        params.forEach(count::setParameter);
        long total = count.getSingleResult();

        // Đang chờ thì cũ nhất trước (xử lý theo thứ tự đến), còn lại mới xử lý trước
        String order = status == ReportStatus.PENDING ? " order by r.createdAt asc, r.id asc" : " order by r.createdAt desc, r.id desc";
        TypedQuery<ContentReport> query = entityManager.createQuery(
                "select r from ContentReport r join fetch r.reporter left join fetch r.resolvedBy"
                        + where + order,
                ContentReport.class);
        params.forEach(query::setParameter);
        query.setFirstResult(safePage * safeSize).setMaxResults(safeSize);
        List<ReportResponse> content = new ArrayList<>();
        for (ContentReport r : query.getResultList()) {
            content.add(toResponse(r));
        }
        return PageResponse.<ReportResponse>builder()
                .content(content)
                .pageNumber(safePage)
                .pageSize(safeSize)
                .totalElements(total)
                .totalPages((int) Math.ceil(total / (double) safeSize))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public long pendingCount() {
        SecurityUtils.requirePermission(AdminPermission.REPORTS_MODERATE);
        return reportRepository.countByStatus(ReportStatus.PENDING);
    }

    @Override
    @Transactional
    public ReportResponse resolve(String reportId, ResolveReportRequest request) {
        SecurityUtils.requirePermission(AdminPermission.REPORTS_MODERATE);
        ContentReport report =
                reportRepository.findById(reportId).orElseThrow(() -> new AppException(ErrorCode.REPORT_NOT_EXISTED));
        if (report.getStatus() != ReportStatus.PENDING) {
            throw new AppException(ErrorCode.REPORT_ALREADY_HANDLED);
        }
        ReportAction action = request == null ? null : request.getAction();
        if (action == null || !action.allowedFor(report.getTargetType())) {
            throw new AppException(ErrorCode.REPORT_ACTION_INVALID);
        }
        String note = request.getNote() == null || request.getNote().isBlank() ? null : request.getNote().trim();
        if (note != null && note.length() > MAX_NOTE) {
            throw new AppException(ErrorCode.REPORT_NOTE_INVALID);
        }
        Member me = currentMember();
        ContentReportRepository.TargetInfo info = targetInfo(report);
        boolean targetGone = info == null || info.getAvailable() == null || info.getAvailable() == 0;
        if (targetGone && action != ReportAction.DISMISS && action != ReportAction.LOCK_ACCOUNT) {
            throw new AppException(ErrorCode.REPORT_TARGET_GONE);
        }

        switch (action) {
            case DISMISS -> {}
            case UNPUBLISH -> unpublish(
                    scoreRepository
                            .findById(report.getScore().getId())
                            .orElseThrow(() -> new AppException(ErrorCode.REPORT_TARGET_GONE)),
                    note);
            case SOFT_DELETE -> scoreService.deleteScore(report.getScore().getId(), note);
            case HIDE -> hide(report, me);
            case LOCK_ACCOUNT -> {
                if (info == null || info.getOwnerId() == null) {
                    throw new AppException(ErrorCode.REPORT_TARGET_GONE);
                }
                adminMemberService.updateMember(
                        info.getOwnerId(),
                        AdminUpdateMemberRequest.builder()
                                .status(MemberStatus.INACTIVE)
                                .statusReason(lockReason(report, note))
                                .build());
            }
        }

        // Một báo cáo xử lý xong thì mọi báo cáo đang chờ trên cùng đối tượng đóng theo
        List<ContentReport> batch = new ArrayList<>(pendingOfSameTarget(report));
        if (batch.stream().noneMatch(r -> r.getId().equals(report.getId()))) {
            batch.add(report);
        }
        LocalDateTime now = LocalDateTime.now();
        ReportStatus closed = action == ReportAction.DISMISS ? ReportStatus.DISMISSED : ReportStatus.RESOLVED;
        for (ContentReport r : batch) {
            r.setStatus(closed);
            r.setAction(action);
            r.setResolutionNote(note);
            r.setResolvedBy(me);
            r.setResolvedAt(now);
        }
        reportRepository.saveAll(batch);

        return toResponse(report);
    }

    // ------------------------------------------------------------------ xử lý từng loại

    private void unpublish(Score score, String note) {
        String visibility = score.getVisibility() == null ? Visibility.PRIVATE.name() : score.getVisibility();
        if (Visibility.PENDING.name().equals(visibility)) {
            scoreService.rejectPublic(score.getId(), note);
        } else {
            // PUBLIC → PRIVATE; bản riêng tư thì service báo SCORE_NOT_PUBLIC
            scoreService.setVisibilityByAdmin(score.getId(), Visibility.PRIVATE, note);
        }
    }

    private void hide(ContentReport report, Member admin) {
        LocalDateTime now = LocalDateTime.now();
        switch (report.getTargetType()) {
            case COMMENT -> {
                ScoreComment comment = commentRepository
                        .findById(report.getComment().getId())
                        .orElseThrow(() -> new AppException(ErrorCode.REPORT_TARGET_GONE));
                comment.setHiddenAt(now);
                comment.setHiddenBy(admin);
                commentRepository.save(comment);
            }
            case FORUM_THREAD -> {
                ForumThread thread = forumThreadRepository
                        .findById(report.getForumThread().getId())
                        .orElseThrow(() -> new AppException(ErrorCode.REPORT_TARGET_GONE));
                thread.setHiddenAt(now);
                thread.setHiddenBy(admin);
                forumThreadRepository.save(thread);
            }
            case FORUM_POST -> {
                ForumPost post = forumPostRepository
                        .findById(report.getForumPost().getId())
                        .orElseThrow(() -> new AppException(ErrorCode.REPORT_TARGET_GONE));
                post.setHiddenAt(now);
                post.setHiddenBy(admin);
                forumPostRepository.save(post);
                // Bài bị ẩn không còn là đáp án hay nhất
                ForumThread parent = forumThreadRepository
                        .findById(post.getThread().getId())
                        .orElse(null);
                if (parent != null
                        && parent.getAcceptedPost() != null
                        && parent.getAcceptedPost().getId().equals(post.getId())) {
                    parent.setAcceptedPost(null);
                    forumThreadRepository.save(parent);
                }
            }
            default -> throw new AppException(ErrorCode.REPORT_ACTION_INVALID);
        }
    }

    /** Mọi báo cáo đang chờ trên cùng đối tượng với báo cáo này (gồm chính nó nếu còn chờ). */
    private List<ContentReport> pendingOfSameTarget(ContentReport r) {
        return switch (r.getTargetType()) {
            case SCORE -> reportRepository.findPendingOfScore(r.getScore().getId());
            case COMMENT -> reportRepository.findPendingOfComment(r.getComment().getId());
            case FORUM_THREAD -> reportRepository.findPendingOfForumThread(r.getForumThread().getId());
            case FORUM_POST -> reportRepository.findPendingOfForumPost(r.getForumPost().getId());
        };
    }

    // ------------------------------------------------------------------ helpers

    /** Lý do khóa ghi vào members.status_reason: lý do báo cáo kèm ghi chú xử lý, cắt về 255 ký tự. */
    private static String lockReason(ContentReport report, String note) {
        String text = "REPORT " + report.getReason().name() + (note == null ? "" : ": " + note);
        return text.length() <= 255 ? text : text.substring(0, 255);
    }

    private record ValidRequest(ReportReason reason, String details) {}

    private static ValidRequest validate(ReportRequest request) {
        if (request == null || request.getReason() == null) {
            throw new AppException(ErrorCode.REPORT_REASON_INVALID);
        }
        String details = request.getDetails() == null || request.getDetails().isBlank()
                ? null
                : request.getDetails().trim();
        if (details != null && details.length() > MAX_DETAILS) {
            throw new AppException(ErrorCode.REPORT_REASON_INVALID);
        }
        if (request.getReason() == ReportReason.OTHER && details == null) {
            throw new AppException(ErrorCode.REPORT_REASON_INVALID);
        }
        return new ValidRequest(request.getReason(), details);
    }

    private void guard(Member me, boolean alreadyPending) {
        if (alreadyPending) {
            throw new AppException(ErrorCode.REPORT_DUPLICATED);
        }
        if (reportRepository.countByReporterIdAndCreatedAtAfter(me.getId(), LocalDateTime.now().minusHours(24))
                >= MAX_REPORTS_PER_DAY) {
            throw new AppException(ErrorCode.REPORT_RATE_LIMITED);
        }
    }

    private ReportResponse toResponse(ContentReport r) {
        ContentReportRepository.TargetInfo info = targetInfo(r);
        String scoreId = r.getScore() == null ? null : r.getScore().getId();
        String commentId = r.getComment() == null ? null : r.getComment().getId();
        String threadId = r.getForumThread() == null ? null : r.getForumThread().getId();
        String postId = r.getForumPost() == null ? null : r.getForumPost().getId();
        long pending = 0;
        if (r.getStatus() == ReportStatus.PENDING) {
            pending = switch (r.getTargetType()) {
                case SCORE -> scoreId == null ? 0 : reportRepository.countPendingOfScore(scoreId);
                case COMMENT -> commentId == null ? 0 : reportRepository.countPendingOfComment(commentId);
                case FORUM_THREAD -> threadId == null ? 0 : reportRepository.findPendingOfForumThread(threadId).size();
                case FORUM_POST -> postId == null ? 0 : reportRepository.findPendingOfForumPost(postId).size();
            };
        }
        return ReportResponse.builder()
                .id(r.getId())
                .targetType(r.getTargetType().name())
                .scoreId(scoreId)
                .commentId(commentId)
                .forumThreadId(threadId)
                .forumPostId(postId)
                .targetLabel(info == null ? null : info.getLabel())
                .targetAvailable(info != null && info.getAvailable() != null && info.getAvailable() == 1)
                .owner(
                        info == null || info.getOwnerId() == null
                                ? null
                                : ReportResponse.Party.builder()
                                        .id(info.getOwnerId())
                                        .email(info.getOwnerEmail())
                                        .fullName(info.getOwnerName())
                                        .build())
                .reporter(party(r.getReporter()))
                .reason(r.getReason().name())
                .details(r.getDetails())
                .status(r.getStatus().name())
                .action(r.getAction() == null ? null : r.getAction().name())
                .resolutionNote(r.getResolutionNote())
                .resolvedBy(party(r.getResolvedBy()))
                .resolvedAt(r.getResolvedAt())
                .createdAt(r.getCreatedAt())
                .pendingOnTarget(pending)
                .build();
    }

    /** Tên, chủ và tình trạng của đối tượng bị báo cáo, tra từ bảng gốc; null nếu đã xóa hẳn hoặc loại chưa hỗ trợ. */
    private ContentReportRepository.TargetInfo targetInfo(ContentReport r) {
        return switch (r.getTargetType()) {
            case SCORE -> r.getScore() == null ? null : reportRepository.findScoreInfo(r.getScore().getId()).orElse(null);
            case COMMENT -> r.getComment() == null
                    ? null
                    : reportRepository.findCommentInfo(r.getComment().getId()).orElse(null);
            case FORUM_THREAD -> r.getForumThread() == null
                    ? null
                    : reportRepository.findForumThreadInfo(r.getForumThread().getId()).orElse(null);
            case FORUM_POST -> r.getForumPost() == null
                    ? null
                    : reportRepository.findForumPostInfo(r.getForumPost().getId()).orElse(null);
        };
    }

    private static ReportResponse.Party party(Member m) {
        return m == null
                ? null
                : ReportResponse.Party.builder()
                        .id(m.getId())
                        .email(m.getEmail())
                        .fullName(m.getFullName())
                        .build();
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }

}
