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
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.entity.ScoreComment;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
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
        boolean scoreType = report.getTargetType() == ReportTargetType.SCORE;
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
            case HIDE -> hideComment(
                    commentRepository
                            .findById(report.getComment().getId())
                            .orElseThrow(() -> new AppException(ErrorCode.REPORT_TARGET_GONE)),
                    me);
            case LOCK_ACCOUNT -> {
                if (info == null || info.getOwnerId() == null) {
                    throw new AppException(ErrorCode.REPORT_TARGET_GONE);
                }
                adminMemberService.updateMember(
                        info.getOwnerId(),
                        AdminUpdateMemberRequest.builder().status(MemberStatus.INACTIVE).build());
            }
        }

        // Một báo cáo xử lý xong thì mọi báo cáo đang chờ trên cùng đối tượng đóng theo
        List<ContentReport> batch = new ArrayList<>(
                scoreType
                        ? reportRepository.findPendingOfScore(report.getScore().getId())
                        : reportRepository.findPendingOfComment(report.getComment().getId()));
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

    private void hideComment(ScoreComment comment, Member admin) {
        comment.setHiddenAt(LocalDateTime.now());
        comment.setHiddenBy(admin);
        commentRepository.save(comment);
    }

    // ------------------------------------------------------------------ helpers

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
        boolean scoreType = r.getTargetType() == ReportTargetType.SCORE;
        ContentReportRepository.TargetInfo info = targetInfo(r);
        String scoreId = r.getScore() == null ? null : r.getScore().getId();
        String commentId = r.getComment() == null ? null : r.getComment().getId();
        long pending = 0;
        if (r.getStatus() == ReportStatus.PENDING) {
            if (scoreType && scoreId != null) pending = reportRepository.countPendingOfScore(scoreId);
            if (!scoreType && commentId != null) pending = reportRepository.countPendingOfComment(commentId);
        }
        return ReportResponse.builder()
                .id(r.getId())
                .targetType(r.getTargetType().name())
                .scoreId(scoreId)
                .commentId(commentId)
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
            case FORUM_POST -> null;
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
