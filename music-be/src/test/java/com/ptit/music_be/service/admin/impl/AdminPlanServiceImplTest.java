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
import com.ptit.music_be.dto.request.CreatePlanRequest;
import com.ptit.music_be.dto.request.UpdatePlanRequest;
import com.ptit.music_be.dto.response.PlanResponse;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PaymentOrderRepository;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.repository.SubscriptionRepository;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.billing.PlanLimitsParser;
import com.ptit.music_be.service.billing.SubscriptionService;

class AdminPlanServiceImplTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final PlanRepository plans = mock(PlanRepository.class);
    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final SubscriptionRepository subscriptionRepo = mock(SubscriptionRepository.class);
    private final PaymentOrderRepository orderRepo = mock(PaymentOrderRepository.class);
    private final AdminPlanServiceImpl service =
            new AdminPlanServiceImpl(plans, subscriptionRepo, orderRepo, subscriptions, objectMapper);

    private final Plan pro = Plan.builder().code("PRO").name("Pro").priceMonth(99000).priceYear(990000).limits("{}").build();
    private final Plan free = Plan.builder().code("FREE").name("Free").limits("{}").build();
    private final PlanLimits limits = new PlanLimits(500, 4, 10240, 30, null, true, false, true, null);

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
        return new UpdatePlanRequest(name, month, year, l, null);
    }

    private CreatePlanRequest newPlan(String code, String audience) {
        return new CreatePlanRequest(code, audience, "Gói mới", 149000L, 1490000L, limits, null);
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
                request("Pro", 99000L, 990000L, new PlanLimits(-1, 1, null, null, null, true, false, true, null)));
        expect(
                ErrorCode.PLAN_LIMITS_INVALID,
                "PRO",
                request("Pro", 99000L, 990000L, new PlanLimits(10, 0, null, null, null, true, false, true, null)));
        verify(plans, never()).save(any());
    }

    @Test
    void superAdminCreatesPlanAtTheEnd() {
        login("ROLE_ADMIN", "ROLE_SUPER_ADMIN");
        when(plans.findByCode("STUDENT")).thenReturn(Optional.empty());
        when(plans.findAllByOrderBySortOrderAsc())
                .thenReturn(List.of(Plan.builder().code("FREE").sortOrder(1).build(), Plan.builder().code("PRO").sortOrder(5).build()));
        when(subscriptions.listPlans()).thenReturn(List.of(PlanResponse.builder().code("STUDENT").build()));

        PlanResponse r = service.create(newPlan(" student ", "personal"));

        assertEquals("STUDENT", r.getCode());
        org.mockito.ArgumentCaptor<Plan> saved = org.mockito.ArgumentCaptor.forClass(Plan.class);
        verify(plans).save(saved.capture());
        assertEquals("STUDENT", saved.getValue().getCode());
        assertEquals(Plan.PERSONAL, saved.getValue().getAudience());
        assertEquals(6, saved.getValue().getSortOrder());
    }

    @Test
    void createRejectsBadCodeDuplicateAndAudience() {
        login("ROLE_ADMIN", "ROLE_SUPER_ADMIN");

        expectCreate(ErrorCode.PLAN_CODE_INVALID, newPlan("a", "PERSONAL"));
        expectCreate(ErrorCode.PLAN_CODE_INVALID, newPlan("CÓ DẤU", "PERSONAL"));
        expectCreate(ErrorCode.PLAN_CODE_INVALID, newPlan("UNLIMITED", "PERSONAL"));
        expectCreate(ErrorCode.PLAN_CODE_EXISTED, newPlan("PRO", "PERSONAL"));
        when(plans.findByCode("NEW_ONE")).thenReturn(Optional.empty());
        expectCreate(ErrorCode.PLAN_AUDIENCE_INVALID, newPlan("NEW_ONE", "FAMILY"));
        verify(plans, never()).save(any());
    }

    @Test
    void plainAdminCannotCreateOrDelete() {
        login("ROLE_ADMIN");

        expectCreate(ErrorCode.UNAUTHORIZED, newPlan("STUDENT", "PERSONAL"));
        AppException e = assertThrows(AppException.class, () -> service.delete("STUDENT"));
        assertEquals(ErrorCode.UNAUTHORIZED, e.getErrorCode());
    }

    @Test
    void deleteOnlyUnusedNonSystemPlans() {
        login("ROLE_ADMIN", "ROLE_SUPER_ADMIN");
        Plan unused = Plan.builder().id("u").code("STUDENT").build();
        Plan used = Plan.builder().id("x").code("TEAM_PRO").build();
        when(plans.findByCode("STUDENT")).thenReturn(Optional.of(unused));
        when(plans.findByCode("TEAM_PRO")).thenReturn(Optional.of(used));
        when(orderRepo.existsByPlanId("x")).thenReturn(true);

        AppException e = assertThrows(AppException.class, () -> service.delete("PRO"));
        assertEquals(ErrorCode.PLAN_SYSTEM_LOCKED, e.getErrorCode());
        e = assertThrows(AppException.class, () -> service.delete("FREE"));
        assertEquals(ErrorCode.PLAN_SYSTEM_LOCKED, e.getErrorCode());
        e = assertThrows(AppException.class, () -> service.delete("TEAM_PRO"));
        assertEquals(ErrorCode.PLAN_IN_USE, e.getErrorCode());

        service.delete("STUDENT");
        verify(plans).delete(unused);
        verify(plans, never()).delete(used);
    }

    private void expectCreate(ErrorCode code, CreatePlanRequest r) {
        AppException e = assertThrows(AppException.class, () -> service.create(r));
        assertEquals(code, e.getErrorCode());
    }
}
