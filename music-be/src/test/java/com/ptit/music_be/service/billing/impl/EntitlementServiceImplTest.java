package com.ptit.music_be.service.billing.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.UsageMetric;
import com.ptit.music_be.dto.response.PlanLimitPayload;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.entity.UsageCounter;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.repository.UsageCounterRepository;
import com.ptit.music_be.service.billing.PlanLimitsParser;
import com.ptit.music_be.service.billing.SubscriptionService;

class EntitlementServiceImplTest {

    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final UsageCounterRepository counters = mock(UsageCounterRepository.class);
    private final PlanRepository plans = mock(PlanRepository.class);
    private final EntitlementServiceImpl service = new EntitlementServiceImpl(
            subscriptions, new PlanLimitsParser(new ObjectMapper()), counters, plans);

    private final Plan free = plan("FREE", 1, "{\"omrPagesPerMonth\":20}");
    private final Plan pro = plan("PRO", 2, "{\"omrPagesPerMonth\":null}");
    private final UsageCounter counter = UsageCounter.builder()
            .memberId("m")
            .metric(UsageMetric.OMR_PAGES)
            .period(YearMonth.now().toString())
            .used(18)
            .build();

    private static Plan plan(String code, int order, String limits) {
        return Plan.builder().code(code).sortOrder(order).limits(limits).build();
    }

    @BeforeEach
    void setUp() {
        when(plans.findAllByOrderBySortOrderAsc()).thenReturn(List.of(free, pro));
        when(counters.findForUpdate(anyString(), any(), anyString())).thenReturn(Optional.of(counter));
        when(counters.save(any(UsageCounter.class))).thenAnswer(i -> i.getArgument(0));
    }

    @Test
    void consumesWithinLimit() {
        when(subscriptions.currentPlan("m")).thenReturn(free);

        service.checkAndConsume("m", UsageMetric.OMR_PAGES, 2);

        assertEquals(20, counter.getUsed());
    }

    @Test
    void rejectsOverLimitWithUpgradeHintAndKeepsCounter() {
        when(subscriptions.currentPlan("m")).thenReturn(free);

        AppException e =
                assertThrows(AppException.class, () -> service.checkAndConsume("m", UsageMetric.OMR_PAGES, 3));

        assertEquals(ErrorCode.PLAN_LIMIT_REACHED, e.getErrorCode());
        PlanLimitPayload payload = (PlanLimitPayload) e.getPayload();
        assertEquals(20, payload.limit());
        assertEquals(18, payload.used());
        assertEquals("PRO", payload.upgradeTo());
        assertEquals(18, counter.getUsed());
    }

    @Test
    void unlimitedPlanNeverRejects() {
        when(subscriptions.currentPlan("m")).thenReturn(pro);

        service.checkAndConsume("m", UsageMetric.OMR_PAGES, 5000);

        assertEquals(5018, counter.getUsed());
    }

    @Test
    void highestPlanHasNoUpgrade() {
        Plan top = plan("TEAM", 3, "{\"omrPagesPerMonth\":10}");
        when(subscriptions.currentPlan("m")).thenReturn(top);
        when(plans.findAllByOrderBySortOrderAsc()).thenReturn(List.of(free, pro, top));

        AppException e =
                assertThrows(AppException.class, () -> service.checkAndConsume("m", UsageMetric.OMR_PAGES, 5));

        assertNull(((PlanLimitPayload) e.getPayload()).upgradeTo());
    }

    @Test
    void releaseNeverGoesBelowZero() {
        service.release("m", UsageMetric.OMR_PAGES, 100, counter.getPeriod());

        assertEquals(0, counter.getUsed());
    }
}
