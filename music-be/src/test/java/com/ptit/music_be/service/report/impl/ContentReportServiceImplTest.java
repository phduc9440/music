package com.ptit.music_be.service.report.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.report.ReportAction;
import com.ptit.music_be.dto.enums.report.ReportReason;
import com.ptit.music_be.dto.enums.report.ReportStatus;
import com.ptit.music_be.dto.enums.report.ReportTargetType;
import com.ptit.music_be.dto.enums.score.Visibility;
import com.ptit.music_be.dto.request.report.ReportRequest;
import com.ptit.music_be.dto.request.report.ResolveReportRequest;
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
import com.ptit.music_be.service.score.ScoreFileService;
import com.ptit.music_be.service.score.ScoreService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ContentReportServiceImplTest {

    @Mock
    ContentReportRepository reportRepository;

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    ScoreCommentRepository commentRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    ScoreFileService scoreFileService;

    @Mock
    ScoreService scoreService;

    @Mock
    AdminMemberService adminMemberService;

    @InjectMocks
    ContentReportServiceImpl service;

    private final Member owner = Member.builder().id("owner").email("owner@x.com").build();
    private final Member reporter = Member.builder().id("rep").email("rep@x.com").build();
    private final Member admin = Member.builder().id("adm").email("admin@x.com").build();
    private Score score;

    @BeforeEach
    void setUp() {
        score = Score.builder().id("s1").title("Bài 1").member(owner).visibility("PUBLIC").build();
        when(scoreRepository.findById("s1")).thenReturn(Optional.of(score));
        when(memberRepository.findByEmail("rep@x.com")).thenReturn(Optional.of(reporter));
        when(memberRepository.findByEmail("owner@x.com")).thenReturn(Optional.of(owner));
        when(memberRepository.findByEmail("admin@x.com")).thenReturn(Optional.of(admin));
        when(reportRepository.save(any(ContentReport.class))).thenAnswer(inv -> inv.getArgument(0));
        ContentReportRepository.TargetInfo visible = info(1);
        when(reportRepository.findScoreInfo("s1")).thenReturn(Optional.of(visible));
        when(reportRepository.findCommentInfo("c1")).thenReturn(Optional.of(visible));
        loginAs("rep@x.com", "ROLE_USER");
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    /** Kết quả tra cứu đối tượng bị báo cáo: chủ là "owner", available 1 = còn hiển thị. */
    private static ContentReportRepository.TargetInfo info(int available) {
        ContentReportRepository.TargetInfo info = org.mockito.Mockito.mock(ContentReportRepository.TargetInfo.class);
        when(info.getLabel()).thenReturn("nhãn");
        when(info.getOwnerId()).thenReturn("owner");
        when(info.getOwnerEmail()).thenReturn("owner@x.com");
        when(info.getAvailable()).thenReturn(available);
        return info;
    }

    private static void loginAs(String email, String role) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", role));
    }

    private static ReportRequest request(ReportReason reason, String details) {
        return ReportRequest.builder().reason(reason).details(details).build();
    }

    private static AppException failure(Runnable action) {
        return (AppException) catchThrowable(action);
    }

    private static Throwable catchThrowable(Runnable action) {
        try {
            action.run();
            return null;
        } catch (Throwable t) {
            return t;
        }
    }

    // ------------------------------------------------------------------ báo cáo

    @Test
    void reportScoreSavesPendingReportWithSnapshot() {
        service.reportScore("s1", request(ReportReason.SPAM, "  quảng cáo  "));

        org.mockito.ArgumentCaptor<ContentReport> captor = org.mockito.ArgumentCaptor.forClass(ContentReport.class);
        verify(reportRepository).save(captor.capture());
        ContentReport saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ReportStatus.PENDING);
        assertThat(saved.getTargetType()).isEqualTo(ReportTargetType.SCORE);
        assertThat(saved.getDetails()).isEqualTo("quảng cáo");
        assertThat(saved.getReporter()).isSameAs(reporter);
    }

    @Test
    void cannotReportOwnScore() {
        loginAs("owner@x.com", "ROLE_USER");
        assertThat(failure(() -> service.reportScore("s1", request(ReportReason.SPAM, null))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_OWN_CONTENT);
        verify(reportRepository, never()).save(any());
    }

    @Test
    void reasonOtherNeedsDetails() {
        assertThat(failure(() -> service.reportScore("s1", request(ReportReason.OTHER, "  "))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_REASON_INVALID);
        assertThat(failure(() -> service.reportScore("s1", request(null, null))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_REASON_INVALID);
        assertThat(failure(() -> service.reportScore("s1", request(ReportReason.SPAM, "x".repeat(1001))))
                        .getErrorCode())
                .isEqualTo(ErrorCode.REPORT_REASON_INVALID);
    }

    @Test
    void duplicatePendingReportIsRejected() {
        when(reportRepository.existsByReporterIdAndScoreIdAndStatus("rep", "s1", ReportStatus.PENDING))
                .thenReturn(true);
        assertThat(failure(() -> service.reportScore("s1", request(ReportReason.SPAM, null))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_DUPLICATED);
    }

    @Test
    void tooManyReportsInADayIsRateLimited() {
        when(reportRepository.countByReporterIdAndCreatedAtAfter(eq("rep"), any())).thenReturn(20L);
        assertThat(failure(() -> service.reportScore("s1", request(ReportReason.SPAM, null))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_RATE_LIMITED);
    }

    @Test
    void reportCommentSnapshotsTheCommentAndItsAuthor() {
        ScoreComment comment = ScoreComment.builder()
                .id("c1")
                .score(score)
                .author(owner)
                .content("nội dung góp ý")
                .build();
        when(commentRepository.findById("c1")).thenReturn(Optional.of(comment));

        service.reportComment("c1", request(ReportReason.INAPPROPRIATE, null));

        org.mockito.ArgumentCaptor<ContentReport> captor = org.mockito.ArgumentCaptor.forClass(ContentReport.class);
        verify(reportRepository).save(captor.capture());
        assertThat(captor.getValue().getTargetType()).isEqualTo(ReportTargetType.COMMENT);
    }

    // ------------------------------------------------------------------ xử lý

    private ContentReport pending(String id, ReportTargetType type, Score s, ScoreComment c) {
        return ContentReport.builder()
                .id(id)
                .targetType(type)
                .score(s)
                .comment(c)
                .reporter(reporter)
                .reason(ReportReason.SPAM)
                .status(ReportStatus.PENDING)
                .build();
    }

    private ResolveReportRequest resolveWith(ReportAction action, String note) {
        return ResolveReportRequest.builder().action(action).note(note).build();
    }

    @Test
    void dismissClosesEveryPendingReportOfTheSameScore() {
        loginAs("admin@x.com", "ROLE_SUPER_ADMIN");
        ContentReport first = pending("r1", ReportTargetType.SCORE, score, null);
        ContentReport second = pending("r2", ReportTargetType.SCORE, score, null);
        when(reportRepository.findById("r1")).thenReturn(Optional.of(first));
        when(reportRepository.findPendingOfScore("s1")).thenReturn(List.of(first, second));

        service.resolve("r1", resolveWith(ReportAction.DISMISS, "không vi phạm"));

        assertThat(first.getStatus()).isEqualTo(ReportStatus.DISMISSED);
        assertThat(second.getStatus()).isEqualTo(ReportStatus.DISMISSED);
        assertThat(second.getResolvedBy()).isSameAs(admin);
        assertThat(second.getResolutionNote()).isEqualTo("không vi phạm");
        verify(scoreService, never()).setVisibilityByAdmin(any(), any(), any());
    }

    @Test
    void unpublishTakesAPublicScoreDown() {
        loginAs("admin@x.com", "ROLE_SUPER_ADMIN");
        ContentReport report = pending("r1", ReportTargetType.SCORE, score, null);
        when(reportRepository.findById("r1")).thenReturn(Optional.of(report));
        when(reportRepository.findPendingOfScore("s1")).thenReturn(List.of(report));

        service.resolve("r1", resolveWith(ReportAction.UNPUBLISH, "vi phạm bản quyền"));

        verify(scoreService).setVisibilityByAdmin("s1", Visibility.PRIVATE, "vi phạm bản quyền");
        assertThat(report.getStatus()).isEqualTo(ReportStatus.RESOLVED);
        assertThat(report.getAction()).isEqualTo(ReportAction.UNPUBLISH);
    }

    @Test
    void softDeleteMovesScoreToTrash() {
        loginAs("admin@x.com", "ROLE_SUPER_ADMIN");
        ContentReport report = pending("r1", ReportTargetType.SCORE, score, null);
        when(reportRepository.findById("r1")).thenReturn(Optional.of(report));
        when(reportRepository.findPendingOfScore("s1")).thenReturn(List.of(report));

        service.resolve("r1", resolveWith(ReportAction.SOFT_DELETE, null));

        verify(scoreService).deleteScore("s1", null);
    }

    @Test
    void hideCommentSetsHiddenAt() {
        loginAs("admin@x.com", "ROLE_SUPER_ADMIN");
        ScoreComment comment =
                ScoreComment.builder().id("c1").score(score).author(owner).content("xấu").build();
        ContentReport report = pending("r1", ReportTargetType.COMMENT, score, comment);
        when(reportRepository.findById("r1")).thenReturn(Optional.of(report));
        when(reportRepository.findPendingOfComment("c1")).thenReturn(List.of(report));
        when(commentRepository.findById("c1")).thenReturn(Optional.of(comment));

        service.resolve("r1", resolveWith(ReportAction.HIDE, null));

        assertThat(comment.getHiddenAt()).isNotNull();
        assertThat(comment.getHiddenBy()).isSameAs(admin);
        verify(commentRepository).save(comment);
    }

    @Test
    void lockAccountLocksTheOwner() {
        loginAs("admin@x.com", "ROLE_SUPER_ADMIN");
        ContentReport report = pending("r1", ReportTargetType.SCORE, score, null);
        when(reportRepository.findById("r1")).thenReturn(Optional.of(report));
        when(reportRepository.findPendingOfScore("s1")).thenReturn(List.of(report));

        service.resolve("r1", resolveWith(ReportAction.LOCK_ACCOUNT, null));

        verify(adminMemberService).updateMember(eq("owner"), any());
    }

    @Test
    void actionMustMatchTargetType() {
        loginAs("admin@x.com", "ROLE_SUPER_ADMIN");
        ContentReport report = pending("r1", ReportTargetType.SCORE, score, null);
        when(reportRepository.findById("r1")).thenReturn(Optional.of(report));

        assertThat(failure(() -> service.resolve("r1", resolveWith(ReportAction.HIDE, null))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_ACTION_INVALID);
        assertThat(failure(() -> service.resolve("r1", resolveWith(null, null))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_ACTION_INVALID);
    }

    @Test
    void goneTargetOnlyAllowsDismiss() {
        loginAs("admin@x.com", "ROLE_SUPER_ADMIN");
        ContentReport report = pending("r1", ReportTargetType.SCORE, score, null);
        when(reportRepository.findById("r1")).thenReturn(Optional.of(report));
        ContentReportRepository.TargetInfo gone = info(0);
        when(reportRepository.findScoreInfo("s1")).thenReturn(Optional.of(gone));
        when(reportRepository.findPendingOfScore("s1")).thenReturn(List.of(report));

        assertThat(failure(() -> service.resolve("r1", resolveWith(ReportAction.UNPUBLISH, null))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_TARGET_GONE);

        service.resolve("r1", resolveWith(ReportAction.DISMISS, null));
        assertThat(report.getStatus()).isEqualTo(ReportStatus.DISMISSED);
    }

    @Test
    void alreadyHandledReportCannotBeResolvedAgain() {
        loginAs("admin@x.com", "ROLE_SUPER_ADMIN");
        ContentReport report = pending("r1", ReportTargetType.SCORE, score, null);
        report.setStatus(ReportStatus.RESOLVED);
        when(reportRepository.findById("r1")).thenReturn(Optional.of(report));

        assertThat(failure(() -> service.resolve("r1", resolveWith(ReportAction.DISMISS, null))).getErrorCode())
                .isEqualTo(ErrorCode.REPORT_ALREADY_HANDLED);
    }

    @Test
    void ordinaryUserCannotResolve() {
        assertThatThrownBy(() -> service.resolve("r1", resolveWith(ReportAction.DISMISS, null)))
                .isInstanceOf(AppException.class);
    }
}
