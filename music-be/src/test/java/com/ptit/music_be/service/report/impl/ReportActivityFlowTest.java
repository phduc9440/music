package com.ptit.music_be.service.report.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.report.ReportAction;
import com.ptit.music_be.dto.enums.report.ReportReason;
import com.ptit.music_be.dto.enums.report.ReportStatus;
import com.ptit.music_be.dto.request.report.ReportRequest;
import com.ptit.music_be.dto.request.report.ResolveReportRequest;
import com.ptit.music_be.dto.response.admin.AdminActivityResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.report.ReportResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.report.ContentReportRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.admin.AdminActivityService;
import com.ptit.music_be.service.report.ContentReportService;

/**
 * Luồng R5 với DB thật (cần MySQL): báo cáo bản công khai → hàng chờ → gỡ công khai. Trang Nhật ký không có bảng riêng,
 * nên test kiểm tra các dòng được suy ra từ chính bảng báo cáo. Test tự trả bản nhạc về trạng thái cũ và xóa báo cáo.
 */
@SpringBootTest
class ReportActivityFlowTest {

    @Autowired
    ContentReportService reportService;

    @Autowired
    AdminActivityService activityService;

    @Autowired
    ContentReportRepository reportRepository;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    MemberRepository memberRepository;

    private Score touched;
    private String originalVisibility;
    private Boolean originalOfficial;
    private final java.time.LocalDateTime startedAt = java.time.LocalDateTime.now().minusSeconds(2);

    @AfterEach
    void clean() {
        SecurityContextHolder.clearContext();
        if (touched != null) {
            Score fresh = scoreRepository.findById(touched.getId()).orElse(null);
            if (fresh != null) {
                fresh.setVisibility(originalVisibility);
                fresh.setIsOfficial(originalOfficial);
                fresh.setRejectReason(null);
                scoreRepository.save(fresh);
            }
        }
        reportRepository.findAll().stream()
                .filter(r -> r.getCreatedAt() != null && r.getCreatedAt().isAfter(startedAt))
                .forEach(reportRepository::delete);
    }

    private static void loginAs(String email, String role) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(email, "x", role));
    }

    @Test
    void reportQueueResolveAndActivityAreDerivedFromReports() {
        Score score = scoreRepository.findAll().stream()
                .filter(s -> "PUBLIC".equals(s.getVisibility()) && s.getMember() != null)
                .findFirst()
                .orElse(null);
        Assumptions.assumeTrue(score != null, "cần một bản PUBLIC trong DB mẫu");
        touched = score;
        originalVisibility = score.getVisibility();
        originalOfficial = score.getIsOfficial();
        Member reporter = memberRepository.findAll().stream()
                .filter(m -> !m.getId().equals(score.getMember().getId()) && "user@music.com".equals(m.getEmail()))
                .findFirst()
                .orElse(null);
        Assumptions.assumeTrue(reporter != null, "cần tài khoản user@music.com khác chủ bản");

        loginAs(reporter.getEmail(), "ROLE_USER");
        reportService.reportScore(
                score.getId(), ReportRequest.builder().reason(ReportReason.COPYRIGHT).details("chép bài").build());

        loginAs("admin@music.com", "ROLE_SUPER_ADMIN");
        PageResponse<ReportResponse> queue = reportService.list(0, 50, ReportStatus.PENDING, null);
        ReportResponse mine = queue.getContent().stream()
                .filter(r -> score.getId().equals(r.getScoreId()) && "chép bài".equals(r.getDetails()))
                .findFirst()
                .orElseThrow();
        assertTrue(mine.isTargetAvailable());
        assertTrue(reportService.pendingCount() >= 1);

        // Mới báo cáo: nhật ký đã có dòng REPORT_CREATED của người báo cáo, chưa có dòng xử lý
        PageResponse<AdminActivityResponse> created = activityService.search(
                0, 50, reporter.getEmail(), "REPORT_CREATED", "SCORE", LocalDate.now().atStartOfDay(), null);
        assertTrue(created.getContent().stream().anyMatch(a -> score.getId().equals(a.getTargetId())
                && "COPYRIGHT".equals(a.getDetail())
                && reporter.getEmail().equals(a.getActorEmail())));

        ReportResponse done = reportService.resolve(
                mine.getId(),
                ResolveReportRequest.builder().action(ReportAction.UNPUBLISH).note("vi phạm").build());
        assertEquals("RESOLVED", done.getStatus());
        assertEquals("PRIVATE", scoreRepository.findById(score.getId()).orElseThrow().getVisibility());

        PageResponse<AdminActivityResponse> resolved =
                activityService.search(0, 50, "admin@music.com", "REPORT_RESOLVED", null, null, null);
        assertTrue(resolved.getContent().stream().anyMatch(a -> score.getId().equals(a.getTargetId())
                && "UNPUBLISH: vi phạm".equals(a.getDetail())));

        // Lọc theo ngày và danh sách loại chạy được trên mọi nhánh
        List<String> types = activityService.types();
        assertTrue(Set.copyOf(types).contains("PLAN_SANCTION"));
        for (String type : types) {
            activityService.search(0, 10, null, type, null, null, null);
        }
        activityService.search(0, 10, null, null, "COMMENT", null, LocalDate.now().plusDays(1).atStartOfDay());
    }
}
