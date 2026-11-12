package com.ptit.music_be.service.billing.impl;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.UsageMetric;
import com.ptit.music_be.dto.response.PlanLimitPayload;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.AiTaskRepository;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.service.billing.PlanLimitsParser;
import com.ptit.music_be.service.billing.SubscriptionService;

class EntitlementServiceImplTest {

    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final AiTaskRepository tasks = mock(AiTaskRepository.class);
    private final PlanRepository plans = mock(PlanRepository.class);
    private final EntitlementServiceImpl service =
            new EntitlementServiceImpl(subscriptions, tasks, plans);
    private final PlanLimitsParser parser = new PlanLimitsParser(new ObjectMapper());

    private final Plan free = plan("FREE", 1, "{\"omrPagesPerMonth\":20}");
    private final Plan pro = plan("PRO", 2, "{\"omrPagesPerMonth\":null}");

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

        AppException e =
                assertThrows(AppException.class, () -> service.checkAvailable("m", UsageMetric.OMR_PAGES, 3));

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

        AppException e =
                assertThrows(AppException.class, () -> service.checkAvailable("m", UsageMetric.OMR_PAGES, 1));

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
}
