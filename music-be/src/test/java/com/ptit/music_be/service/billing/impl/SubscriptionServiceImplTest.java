package com.ptit.music_be.service.billing.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.Period;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.SubscriptionSource;
import com.ptit.music_be.dto.enums.SubscriptionStatus;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.entity.Subscription;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.repository.SubscriptionRepository;
import com.ptit.music_be.repository.UsageCounterRepository;
import com.ptit.music_be.service.billing.PlanLimitsParser;

class SubscriptionServiceImplTest {

    private final SubscriptionRepository subs = mock(SubscriptionRepository.class);
    private final PlanRepository plans = mock(PlanRepository.class);
    private final SubscriptionServiceImpl service = new SubscriptionServiceImpl(
            plans,
            subs,
            mock(UsageCounterRepository.class),
            mock(MemberRepository.class),
            new PlanLimitsParser(new ObjectMapper()));

    private final Member member = Member.builder().id("m").build();
    private final Plan pro = Plan.builder().id("pro").code("PRO").limits("{}").build();
    private final Plan team = Plan.builder().id("team").code("TEAM").limits("{}").build();

    private Subscription current(Plan plan, LocalDateTime expires) {
        return Subscription.builder()
                .member(member)
                .plan(plan)
                .status(SubscriptionStatus.ACTIVE)
                .source(SubscriptionSource.PAYMENT)
                .startsAt(LocalDateTime.now().minusDays(1))
                .expiresAt(expires)
                .build();
    }

    @Test
    void activateSamePlanExtendsFromExpiry() {
        LocalDateTime expires = LocalDateTime.now().plusDays(10);
        Subscription sub = current(pro, expires);
        when(subs.findCurrentOne(any(), any())).thenReturn(Optional.of(sub));

        service.activate(member, pro, Period.ofMonths(1), SubscriptionSource.PAYMENT);

        assertEquals(expires.plusMonths(1), sub.getExpiresAt());
    }

    @Test
    void activateDifferentPlanCancelsOldAndStartsNew() {
        Subscription old = current(pro, LocalDateTime.now().plusDays(10));
        when(subs.findCurrentOne(any(), any())).thenReturn(Optional.of(old));

        service.activate(member, team, Period.ofYears(1), SubscriptionSource.PAYMENT);

        assertEquals(SubscriptionStatus.CANCELED, old.getStatus());
        ArgumentCaptor<Subscription> saved = ArgumentCaptor.forClass(Subscription.class);
        verify(subs, org.mockito.Mockito.times(2)).save(saved.capture());
        Subscription created = saved.getAllValues().get(1);
        assertEquals("TEAM", created.getPlan().getCode());
        assertEquals(SubscriptionStatus.ACTIVE, created.getStatus());
        assertTrue(created.getExpiresAt().isAfter(LocalDateTime.now().plusMonths(11)));
    }

    @Test
    void revokeCancelsWhenNothingLeft() {
        Subscription sub = current(pro, LocalDateTime.now().plusDays(20));
        when(subs.findCurrentOne(any(), any())).thenReturn(Optional.of(sub));

        service.revoke("m", pro, Period.ofMonths(1));

        assertEquals(SubscriptionStatus.CANCELED, sub.getStatus());
    }

    @Test
    void revokeOnlyShortensWhenTimeRemains() {
        LocalDateTime expires = LocalDateTime.now().plusMonths(3);
        Subscription sub = current(pro, expires);
        when(subs.findCurrentOne(any(), any())).thenReturn(Optional.of(sub));

        service.revoke("m", pro, Period.ofMonths(1));

        assertEquals(SubscriptionStatus.ACTIVE, sub.getStatus());
        assertEquals(expires.minusMonths(1), sub.getExpiresAt());
    }

    @Test
    void revokeIgnoresDifferentPlan() {
        when(subs.findCurrentOne(any(), any())).thenReturn(Optional.of(current(team, LocalDateTime.now().plusDays(5))));

        service.revoke("m", pro, Period.ofMonths(1));

        verify(subs, never()).save(any());
    }

    @Test
    void grantRejectsBadDays() {
        AppException e = assertThrows(AppException.class, () -> service.grant("m", "PRO", 0));
        assertEquals(ErrorCode.SUBSCRIPTION_DAYS_INVALID, e.getErrorCode());
    }

    @Test
    void expireDueMarksExpired() {
        Subscription sub = current(pro, LocalDateTime.now().minusDays(1));
        when(subs.findByStatusAndExpiresAtBefore(any(), any())).thenReturn(List.of(sub));

        assertEquals(1, service.expireDue());
        assertEquals(SubscriptionStatus.EXPIRED, sub.getStatus());
    }
}
