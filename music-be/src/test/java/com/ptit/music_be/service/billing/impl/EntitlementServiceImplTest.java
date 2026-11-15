package com.ptit.music_be.service.billing.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.Collection;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.billing.UsageMetric;
import com.ptit.music_be.dto.response.billing.PlanLimitPayload;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.billing.PlanRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.service.billing.PlanLimitsParser;
import com.ptit.music_be.service.billing.SubscriptionService;

class EntitlementServiceImplTest {

    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final AiTaskRepository tasks = mock(AiTaskRepository.class);
    private final PlanRepository plans = mock(PlanRepository.class);
    private final ScoreFileRepository scoreFiles = mock(ScoreFileRepository.class);
    private final EntitlementServiceImpl service = new EntitlementServiceImpl(subscriptions, tasks, plans, scoreFiles);
    private final PlanLimitsParser parser = new PlanLimitsParser(new ObjectMapper());

    private static final long MB = 1024L * 1024L;

    private final Plan free = plan("FREE", 1, "{\"omrPagesPerMonth\":20,\"storageMb\":200,\"exportsPerMonth\":10}");
    private final Plan pro = plan("PRO", 2, "{\"omrPagesPerMonth\":null,\"storageMb\":null,\"exportsPerMonth\":null}");

    private static Plan plan(String code, int order, String limits) {
        return Plan.builder().code(code).sortOrder(order).limits(limits).build();
    }

    /** Người dùng chỉ có gói này: gói chính và hạn mức gộp đều là của gói đó. */
    private void use(Plan plan) {
        when(subscriptions.currentPlan("m")).thenReturn(plan);
        when(subscriptions.effectiveLimits("m")).thenReturn(parser.parse(plan));
    }

    @BeforeEach
    void setUp() {
        when(plans.findAllByOrderBySortOrderAsc()).thenReturn(List.of(free, pro));
        // Đã dùng 18 trang trong tháng (tổng pagesCharged của các task OMR chưa lỗi/hủy)
        when(tasks.sumOmrPagesCharged(eq("m"), any(), any())).thenReturn(18L);
    }

    @Test
    void allowsWithinLimit() {
        use(free);

        assertDoesNotThrow(() -> service.checkAvailable("m", UsageMetric.OMR_PAGES, 2));
    }

    @Test
    void rejectsOverLimitWithUpgradeHint() {
        use(free);

        AppException e = assertThrows(AppException.class, () -> service.checkAvailable("m", UsageMetric.OMR_PAGES, 3));

        assertEquals(ErrorCode.PLAN_LIMIT_REACHED, e.getErrorCode());
        PlanLimitPayload payload = (PlanLimitPayload) e.getPayload();
        assertEquals(20, payload.limit());
        assertEquals(18, payload.used());
        assertEquals("PRO", payload.upgradeTo());
    }

    @Test
    void unlimitedPlanNeverRejects() {
        use(pro);

        assertDoesNotThrow(() -> service.checkAvailable("m", UsageMetric.OMR_PAGES, 100_000));
    }

    @Test
    void highestPlanHasNoUpgrade() {
        Plan capped = plan("PRO", 2, "{\"omrPagesPerMonth\":10}");
        use(capped);

        AppException e = assertThrows(AppException.class, () -> service.checkAvailable("m", UsageMetric.OMR_PAGES, 1));

        assertNull(((PlanLimitPayload) e.getPayload()).upgradeTo());
    }

    @Test
    void usedThisMonthIsComputedFromTasksOfTheCalendarMonth() {
        assertEquals(18, service.usedThisMonth("m", UsageMetric.OMR_PAGES));

        ArgumentCaptor<LocalDateTime> from = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<LocalDateTime> to = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(tasks).sumOmrPagesCharged(eq("m"), from.capture(), to.capture());
        assertEquals(YearMonth.now().atDay(1).atStartOfDay(), from.getValue());
        assertEquals(from.getValue().plusMonths(1), to.getValue());
    }

    // ---------------------------------------------------------------- xuất file (PL-1)

    @Test
    void tenthExportOfTheMonthIsAllowedButTheEleventhIsRejected() {
        use(free);
        when(tasks.countExportsCharged(eq("m"), any(), any())).thenReturn(9L);
        assertDoesNotThrow(() -> service.checkAvailable("m", UsageMetric.EXPORTS, 1));

        when(tasks.countExportsCharged(eq("m"), any(), any())).thenReturn(10L);
        AppException e = assertThrows(AppException.class, () -> service.checkAvailable("m", UsageMetric.EXPORTS, 1));

        assertEquals(ErrorCode.PLAN_LIMIT_REACHED, e.getErrorCode());
        PlanLimitPayload payload = (PlanLimitPayload) e.getPayload();
        assertEquals("EXPORTS", payload.metric());
        assertEquals(10, payload.limit());
        assertEquals(10, payload.used());
        assertEquals("PRO", payload.upgradeTo());
    }

    @Test
    void unlimitedPlanNeverRejectsExports() {
        use(pro);
        when(tasks.countExportsCharged(eq("m"), any(), any())).thenReturn(5000L);

        assertDoesNotThrow(() -> service.checkAvailable("m", UsageMetric.EXPORTS, 1));
    }

    // ---------------------------------------------------------------- dung lượng (PL-5)

    private void usedBytes(long bytes) {
        when(scoreFiles.sumBytesOwnedBy(eq("m"), any())).thenReturn(bytes);
    }

    @Test
    void storageWithinTheLimitIsAllowed() {
        use(free);
        usedBytes(150 * MB);

        assertDoesNotThrow(() -> service.checkStorage("m", 50 * MB));
    }

    @Test
    void storageOverTheLimitIsRejectedWithMegabytes() {
        use(free);
        usedBytes(150 * MB);

        AppException e = assertThrows(AppException.class, () -> service.checkStorage("m", 50 * MB + 1));

        assertEquals(ErrorCode.PLAN_LIMIT_REACHED, e.getErrorCode());
        PlanLimitPayload payload = (PlanLimitPayload) e.getPayload();
        assertEquals("STORAGE_MB", payload.metric());
        assertEquals(200, payload.limit());
        assertEquals(150, payload.used());
        assertEquals("PRO", payload.upgradeTo());
    }

    @Test
    void storageRoundsUsageUpToWholeMegabytes() {
        use(free);
        usedBytes(199 * MB + 1);

        assertThrows(AppException.class, () -> service.checkStorage("m", 1));
    }

    @Test
    void storageOnlyCountsContentFileTypes() {
        use(free);
        usedBytes(0);

        service.checkStorage("m", 1);

        ArgumentCaptor<Collection<String>> types = ArgumentCaptor.captor();
        verify(scoreFiles).sumBytesOwnedBy(eq("m"), types.capture());
        assertThat(types.getValue())
                .contains("ORIGINAL_PDF", "ORIGINAL_IMAGE", "MUSICXML", "MIDI", "PNG", "KERN")
                .doesNotContain("MP3", "WAV", "PDF", "SVG");
    }

    @Test
    void unlimitedStorageSkipsTheQuery() {
        use(pro);

        assertDoesNotThrow(() -> service.checkStorage("m", Long.MAX_VALUE));
        verifyNoInteractions(scoreFiles);
    }
}
