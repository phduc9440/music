package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.request.UpdatePlanRequest;
import com.ptit.music_be.dto.response.PlanResponse;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.billing.PlanLimitsParser;
import com.ptit.music_be.service.billing.SubscriptionService;

class AdminPlanServiceImplTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final PlanRepository plans = mock(PlanRepository.class);
    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final AdminPlanServiceImpl service = new AdminPlanServiceImpl(plans, subscriptions, objectMapper);

    private final Plan pro = Plan.builder().code("PRO").name("Pro").priceMonth(99000).priceYear(990000).limits("{}").build();
    private final Plan free = Plan.builder().code("FREE").name("Free").limits("{}").build();
    private final PlanLimits limits = new PlanLimits(500, 4, 10240, 30, null, true, false, true);

    @BeforeEach
    void setUp() {
        when(plans.findByCode("PRO")).thenReturn(Optional.of(pro));
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));
        when(subscriptions.listPlans()).thenReturn(List.of(PlanResponse.builder().code("PRO").build()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void login(String... roles) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("a@x.com", "x", roles));
    }

    private UpdatePlanRequest request(String name, Long month, Long year, PlanLimits l) {
        return new UpdatePlanRequest(name, month, year, l);
    }

    private void expect(ErrorCode code, String planCode, UpdatePlanRequest r) {
        AppException e = assertThrows(AppException.class, () -> service.update(planCode, r));
        assertEquals(code, e.getErrorCode());
    }

    @Test
    void superAdminUpdatesNamePricesAndLimits() {
        login("ROLE_ADMIN", "ROLE_SUPER_ADMIN");

        service.update("PRO", request("  Pro Plus ", 120000L, 1200000L, limits));

        assertEquals("Pro Plus", pro.getName());
        assertEquals(120000, pro.getPriceMonth());
        assertEquals(1200000, pro.getPriceYear());
        PlanLimits saved = new PlanLimitsParser(objectMapper).parse(pro);
        assertEquals(500, saved.omrPagesPerMonth());
        assertEquals(null, saved.exportsPerMonth());
        assertTrue(saved.collab());
        assertEquals(false, saved.team());
    }

    @Test
    void plainAdminCannotUpdate() {
        login("ROLE_ADMIN");

        expect(ErrorCode.UNAUTHORIZED, "PRO", request("Pro", 1L, 1L, limits));
        verify(plans, never()).save(any());
    }

    @Test
    void invalidInputIsRejected() {
        login("ROLE_ADMIN", "ROLE_SUPER_ADMIN");

        expect(ErrorCode.PLAN_NAME_INVALID, "PRO", request("  ", 99000L, 990000L, limits));
        expect(ErrorCode.PLAN_NAME_INVALID, "PRO", request("x".repeat(101), 99000L, 990000L, limits));
        expect(ErrorCode.PLAN_PRICE_INVALID, "PRO", request("Pro", 0L, 990000L, limits));
        expect(ErrorCode.PLAN_PRICE_INVALID, "PRO", request("Pro", 2_000_000_000L, 990000L, limits));
        expect(ErrorCode.PLAN_PRICE_INVALID, "FREE", request("Free", 1000L, 0L, limits));
        expect(ErrorCode.PLAN_LIMITS_INVALID, "PRO", request("Pro", 99000L, 990000L, null));
        expect(
                ErrorCode.PLAN_LIMITS_INVALID,
                "PRO",
                request("Pro", 99000L, 990000L, new PlanLimits(-1, 1, null, null, null, true, false, true)));
        expect(
                ErrorCode.PLAN_LIMITS_INVALID,
                "PRO",
                request("Pro", 99000L, 990000L, new PlanLimits(10, 0, null, null, null, true, false, true)));
        verify(plans, never()).save(any());
    }
}
