package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.request.UpdatePlanPriceRequest;
import com.ptit.music_be.dto.response.PlanResponse;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.service.billing.SubscriptionService;

class AdminPlanServiceImplTest {

    private final PlanRepository plans = mock(PlanRepository.class);
    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final AdminPlanServiceImpl service = new AdminPlanServiceImpl(plans, subscriptions);

    private final Plan pro = Plan.builder().code("PRO").priceMonth(99000).priceYear(990000).build();
    private final Plan free = Plan.builder().code("FREE").build();

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void login(String... roles) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("a@x.com", "x", roles));
    }

    @Test
    void superAdminChangesPrice() {
        login("ROLE_ADMIN", "ROLE_SUPER_ADMIN");
        when(plans.findByCode("PRO")).thenReturn(Optional.of(pro));
        when(subscriptions.listPlans())
                .thenReturn(List.of(PlanResponse.builder().code("PRO").priceMonth(120000).build()));

        PlanResponse r = service.updatePrice("PRO", new UpdatePlanPriceRequest(120000L, 1200000L));

        assertEquals(120000, pro.getPriceMonth());
        assertEquals(1200000, pro.getPriceYear());
        assertEquals("PRO", r.getCode());
    }

    @Test
    void plainAdminCannotChangePrice() {
        login("ROLE_ADMIN");

        AppException e = assertThrows(
                AppException.class, () -> service.updatePrice("PRO", new UpdatePlanPriceRequest(1L, 1L)));
        assertEquals(ErrorCode.UNAUTHORIZED, e.getErrorCode());
        verify(plans, never()).save(any());
    }

    @Test
    void invalidPricesAreRejected() {
        login("ROLE_ADMIN", "ROLE_SUPER_ADMIN");
        when(plans.findByCode("PRO")).thenReturn(Optional.of(pro));
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));

        for (UpdatePlanPriceRequest bad : List.of(
                new UpdatePlanPriceRequest(0L, 990000L),
                new UpdatePlanPriceRequest(-1L, 990000L),
                new UpdatePlanPriceRequest(99000L, null),
                new UpdatePlanPriceRequest(2_000_000_000L, 990000L))) {
            AppException e = assertThrows(AppException.class, () -> service.updatePrice("PRO", bad));
            assertEquals(ErrorCode.PLAN_PRICE_INVALID, e.getErrorCode());
        }
        AppException e = assertThrows(
                AppException.class, () -> service.updatePrice("FREE", new UpdatePlanPriceRequest(1000L, 0L)));
        assertEquals(ErrorCode.PLAN_PRICE_INVALID, e.getErrorCode());
        verify(plans, never()).save(any());
    }
}
