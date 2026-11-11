package com.ptit.music_be.service.billing.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.time.Period;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.SubscriptionSource;
import com.ptit.music_be.dto.enums.SubscriptionStatus;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.entity.Subscription;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.repository.RolePlanSuspensionRepository;
import com.ptit.music_be.repository.SubscriptionRepository;
import com.ptit.music_be.repository.UsageCounterRepository;
import com.ptit.music_be.service.billing.PlanLimitsParser;
import com.ptit.music_be.service.notification.NotificationService;

class SubscriptionServiceImplTest {

    @org.junit.jupiter.api.AfterEach
    void clearSecurity() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    private final SubscriptionRepository subs = mock(SubscriptionRepository.class);
    private final MemberRepository memberRepo = mock(MemberRepository.class);
    private final PlanRepository plans = mock(PlanRepository.class);
    private final NotificationService notifications = mock(NotificationService.class);
    private final RolePlanSuspensionRepository suspensions = mock(RolePlanSuspensionRepository.class);
    private final SubscriptionServiceImpl service = new SubscriptionServiceImpl(
            plans,
            subs,
            mock(UsageCounterRepository.class),
            memberRepo,
            new PlanLimitsParser(new ObjectMapper()),
            notifications,
            suspensions);

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
    void grantRejectsBadMonths() {
        AppException e = assertThrows(AppException.class, () -> service.grant("m", "PRO", 0));
        assertEquals(ErrorCode.SUBSCRIPTION_MONTHS_INVALID, e.getErrorCode());
        e = assertThrows(AppException.class, () -> service.grant("m", "PRO", 121));
        assertEquals(ErrorCode.SUBSCRIPTION_MONTHS_INVALID, e.getErrorCode());
    }

    @Test
    void grantingSamePlanExtendsByCalendarMonthsFromCurrentExpiry() {
        LocalDateTime end = LocalDateTime.of(2027, 1, 31, 10, 0);
        Subscription sub = current(pro, end);
        when(memberRepo.findById("m")).thenReturn(Optional.of(member));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(pro));
        when(subs.findCurrentOne(eq("m"), any())).thenReturn(Optional.of(sub));

        service.grant("m", "PRO", 1);

        // 31/01 + 1 tháng = 28/02 (theo lịch), nối tiếp từ ngày hết hạn cũ
        assertEquals(LocalDateTime.of(2027, 2, 28, 10, 0), sub.getExpiresAt());
    }

    @Test
    void expireDueMarksExpired() {
        Subscription sub = current(pro, LocalDateTime.now().minusDays(1));
        when(subs.findByStatusAndExpiresAtBefore(any(), any())).thenReturn(List.of(sub));

        assertEquals(1, service.expireDue());
        assertEquals(SubscriptionStatus.EXPIRED, sub.getStatus());
    }

    @Test
    void remindExpiringNotifiesPlansInSevenDayAndOneDayWindows() {
        Subscription seven = current(pro, LocalDateTime.now().plusDays(7).minusHours(2));
        Subscription one = current(pro, LocalDateTime.now().plusHours(10));
        when(subs.findByStatusAndExpiresAtGreaterThanAndExpiresAtLessThanEqual(
                        eq(SubscriptionStatus.ACTIVE), any(), any()))
                .thenAnswer(inv -> {
                    LocalDateTime to = inv.getArgument(2);
                    return to.isAfter(LocalDateTime.now().plusDays(2)) ? List.of(seven) : List.of(one);
                });

        assertEquals(2, service.remindExpiring());
        verify(notifications, times(2))
                .notify(any(), any(), eq(NotificationType.PLAN_EXPIRING), any(), any(), any());
    }

    @Test
    void superAdminGetsUnlimitedPlanWithoutSubscription() {
        when(memberRepo.roleNamesOf("m")).thenReturn(List.of("USER", "ADMIN", "SUPER_ADMIN"));

        Plan plan = service.currentPlan("m");

        assertEquals(SubscriptionServiceImpl.UNLIMITED, plan.getCode());
        assertEquals(null, new PlanLimitsParser(new ObjectMapper()).parse(plan).omrPagesPerMonth());
    }

    @Test
    void adminGetsProForeverButKeepsAHigherPaidPlan() {
        Plan proPlan = Plan.builder().id("pro").code("PRO").sortOrder(2).limits("{}").build();
        Plan premium = Plan.builder().id("premium").code("PREMIUM").sortOrder(3).limits("{}").build();
        when(memberRepo.roleNamesOf("m")).thenReturn(List.of("ADMIN"));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(proPlan));
        when(subs.findCurrentOne(eq("m"), any())).thenReturn(Optional.empty());

        assertEquals("PRO", service.currentPlan("m").getCode());

        when(subs.findCurrentOne(eq("m"), any()))
                .thenReturn(Optional.of(current(premium, LocalDateTime.now().plusDays(10))));
        assertEquals("PREMIUM", service.currentPlan("m").getCode());
    }

    @Test
    void normalUserWithoutSubscriptionIsFree() {
        Plan free = Plan.builder().id("free").code("FREE").sortOrder(1).limits("{}").build();
        when(memberRepo.roleNamesOf("m")).thenReturn(List.of("USER"));
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));
        when(subs.findCurrentOne(eq("m"), any())).thenReturn(Optional.empty());

        assertEquals("FREE", service.currentPlan("m").getCode());
    }

    @Test
    void grantRejectsTeamPlansAndSuperAdminTargets() {
        Plan teamPro = Plan.builder().id("tp").code("TEAM_PRO").audience(Plan.TEAM).limits("{}").build();
        when(memberRepo.findById("m")).thenReturn(Optional.of(member));
        when(plans.findByCode("TEAM_PRO")).thenReturn(Optional.of(teamPro));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(pro));

        AppException e = assertThrows(AppException.class, () -> service.grant("m", "TEAM_PRO", 1));
        assertEquals(ErrorCode.PLAN_NOT_GRANTABLE, e.getErrorCode());

        when(memberRepo.roleNamesOf("m")).thenReturn(List.of("ADMIN", "SUPER_ADMIN"));
        e = assertThrows(AppException.class, () -> service.grant("m", "PRO", 1));
        assertEquals(ErrorCode.PAYMENT_NOT_NEEDED, e.getErrorCode());
        verify(subs, never()).save(any());
    }

    @Test
    void plansOfSummarisesEachMemberInOneQuery() {
        Plan free = Plan.builder().id("free").code("FREE").name("Free").sortOrder(1).limits("{}").build();
        Plan proPlan = Plan.builder().id("pro").code("PRO").name("Pro").sortOrder(2).limits("{}").build();
        Plan premium = Plan.builder().id("premium").code("PREMIUM").name("Premium").sortOrder(3).limits("{}").build();
        Member buyer = Member.builder().id("buyer").build();
        Subscription bought = Subscription.builder()
                .member(buyer)
                .plan(premium)
                .status(SubscriptionStatus.ACTIVE)
                .source(SubscriptionSource.ADMIN_GRANT)
                .expiresAt(LocalDateTime.now().plusDays(5))
                .build();
        when(subs.findCurrentOfMembers(any(), any())).thenReturn(List.of(bought));
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(proPlan));

        var result = service.plansOf(java.util.Map.of(
                "boss", java.util.Set.of("ADMIN", "SUPER_ADMIN"),
                "mod", java.util.Set.of("ADMIN"),
                "buyer", java.util.Set.of("USER"),
                "nobody", java.util.Set.of("USER")));

        assertEquals("UNLIMITED", result.get("boss").getStatus());
        assertEquals("PRO", result.get("mod").getCode());
        assertEquals("ROLE", result.get("mod").getSource());
        assertEquals("PREMIUM", result.get("buyer").getCode());
        assertEquals("ADMIN_GRANT", result.get("buyer").getSource());
        assertEquals("FREE", result.get("nobody").getStatus());
        verify(subs, times(1)).findCurrentOfMembers(any(), any());
    }

    @Test
    void suspendedAdminLosesRolePlanUntilTheEndDate() {
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(new org.springframework.security.authentication.TestingAuthenticationToken(
                        "boss@x.com", "x", "ROLE_ADMIN", "ROLE_SUPER_ADMIN"));
        Plan free = Plan.builder().id("free").code("FREE").name("Free").sortOrder(1).limits("{}").build();
        Plan proPlan = Plan.builder().id("pro").code("PRO").name("Pro").sortOrder(2).limits("{}").build();
        Member mod = Member.builder().id("mod").build();
        when(memberRepo.findById("mod")).thenReturn(Optional.of(mod));
        when(memberRepo.roleNamesOf("mod")).thenReturn(List.of("ADMIN"));
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(proPlan));
        when(subs.findCurrentOne(eq("mod"), any())).thenReturn(Optional.empty());
        when(suspensions.findActive(eq("mod"), any())).thenReturn(List.of());

        assertEquals("PRO", service.currentPlan("mod").getCode());

        // Tạm ngưng 1 tháng: lưu một dòng tạm ngưng đến đúng 1 tháng sau
        org.mockito.ArgumentCaptor<com.ptit.music_be.entity.RolePlanSuspension> saved =
                org.mockito.ArgumentCaptor.forClass(com.ptit.music_be.entity.RolePlanSuspension.class);
        service.suspendRolePlan("mod", 1, " vi phạm ");
        verify(suspensions).save(saved.capture());
        var suspension = saved.getValue();
        assertEquals("mod", suspension.getMemberId());
        assertEquals("vi phạm", suspension.getReason());
        assertEquals(suspension.getStartsAt().plusMonths(1), suspension.getEndsAt());

        // Trong thời hạn: về Free; hết hạn (repo không còn trả dòng hiệu lực) thì tự dùng lại Pro
        when(suspensions.findActive(eq("mod"), any())).thenReturn(List.of(suspension));
        assertEquals("FREE", service.currentPlan("mod").getCode());
        when(suspensions.findActive(eq("mod"), any())).thenReturn(List.of());
        assertEquals("PRO", service.currentPlan("mod").getCode());
    }

    @Test
    void suspendUntilEndOfMonthAndLiftEarly() {
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(new org.springframework.security.authentication.TestingAuthenticationToken(
                        "boss@x.com", "x", "ROLE_ADMIN", "ROLE_SUPER_ADMIN"));
        Member mod = Member.builder().id("mod").build();
        when(memberRepo.findById("mod")).thenReturn(Optional.of(mod));
        when(memberRepo.roleNamesOf("mod")).thenReturn(List.of("ADMIN"));
        when(plans.findByCode("FREE")).thenReturn(Optional.of(Plan.builder().code("FREE").limits("{}").build()));
        var active = com.ptit.music_be.entity.RolePlanSuspension.builder()
                .memberId("mod")
                .startsAt(LocalDateTime.now().minusDays(1))
                .endsAt(LocalDateTime.now().plusDays(3))
                .build();
        when(suspensions.findActive(eq("mod"), any())).thenReturn(List.of(active));

        org.mockito.ArgumentCaptor<com.ptit.music_be.entity.RolePlanSuspension> saved =
                org.mockito.ArgumentCaptor.forClass(com.ptit.music_be.entity.RolePlanSuspension.class);
        service.suspendRolePlan("mod", 0, null);
        verify(suspensions, times(2)).save(saved.capture());
        // lần ngưng cũ được kết thúc, lần mới kéo đến 00:00 ngày 1 tháng sau
        assertNotNull(active.getLiftedAt());
        var next = saved.getAllValues().get(1);
        assertEquals(1, next.getEndsAt().getDayOfMonth());
        assertEquals(0, next.getEndsAt().getHour());
        assertTrue(next.getEndsAt().isAfter(LocalDateTime.now()));

        AppException e = assertThrows(AppException.class, () -> service.suspendRolePlan("mod", 121, null));
        assertEquals(ErrorCode.ROLE_PLAN_SUSPENSION_INVALID, e.getErrorCode());
    }

    @Test
    void rolePlanOnlyAppliesToPlainAdmins() {
        when(memberRepo.findById("u")).thenReturn(Optional.of(Member.builder().id("u").build()));
        when(memberRepo.roleNamesOf("u")).thenReturn(List.of("USER"));
        AppException e = assertThrows(AppException.class, () -> service.suspendRolePlan("u", 1, null));
        assertEquals(ErrorCode.ROLE_PLAN_NOT_APPLICABLE, e.getErrorCode());

        when(memberRepo.roleNamesOf("u")).thenReturn(List.of("ADMIN", "SUPER_ADMIN"));
        e = assertThrows(AppException.class, () -> service.liftRolePlanSuspension("u"));
        assertEquals(ErrorCode.ROLE_PLAN_NOT_APPLICABLE, e.getErrorCode());
    }

    @Test
    void grantManyGrantsRenewsAndSkipsPerMember() {
        Plan premium = Plan.builder().id("premium").code("PREMIUM").name("Premium").sortOrder(3).limits("{}").build();
        Member newbie = Member.builder().id("newbie").build();
        Member loyal = Member.builder().id("loyal").build();
        Subscription loyalSub = current(premium, LocalDateTime.of(2027, 3, 31, 9, 0));
        when(plans.findByCode("PREMIUM")).thenReturn(Optional.of(premium));
        when(memberRepo.findById("newbie")).thenReturn(Optional.of(newbie));
        when(memberRepo.findById("loyal")).thenReturn(Optional.of(loyal));
        when(memberRepo.findById("boss")).thenReturn(Optional.of(Member.builder().id("boss").build()));
        when(memberRepo.findById("ghost")).thenReturn(Optional.empty());
        when(memberRepo.roleNamesOf("boss")).thenReturn(List.of("ADMIN", "SUPER_ADMIN"));
        when(subs.findCurrentOne(eq("newbie"), any())).thenReturn(Optional.empty());
        when(subs.findCurrentOne(eq("loyal"), any())).thenReturn(Optional.of(loyalSub));

        var results = service.grantMany(List.of("newbie", "loyal", "boss", "ghost", "loyal"), "PREMIUM", 2);

        assertEquals(4, results.size());
        assertEquals("GRANTED", results.get(0).getStatus());
        assertEquals("RENEWED", results.get(1).getStatus());
        assertEquals(LocalDateTime.of(2027, 5, 31, 9, 0), loyalSub.getExpiresAt());
        assertEquals("SKIPPED", results.get(2).getStatus());
        assertEquals("FAILED", results.get(3).getStatus());
    }

    @Test
    void grantManyRejectsTeamPlanAndBadInput() {
        Plan teamPro = Plan.builder().id("tp").code("TEAM_PRO").audience(Plan.TEAM).limits("{}").build();
        when(plans.findByCode("TEAM_PRO")).thenReturn(Optional.of(teamPro));

        AppException e = assertThrows(AppException.class, () -> service.grantMany(List.of("a"), "TEAM_PRO", 1));
        assertEquals(ErrorCode.PLAN_NOT_GRANTABLE, e.getErrorCode());
        e = assertThrows(AppException.class, () -> service.grantMany(List.of(), "PRO", 1));
        assertEquals(ErrorCode.INVALID_REQUEST, e.getErrorCode());
        e = assertThrows(AppException.class, () -> service.grantMany(List.of("a"), "PRO", 0));
        assertEquals(ErrorCode.SUBSCRIPTION_MONTHS_INVALID, e.getErrorCode());
    }

    @Test
    void suspendAndLiftManyAdminsSkipsOthers() {
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(new org.springframework.security.authentication.TestingAuthenticationToken(
                        "boss@x.com", "x", "ROLE_ADMIN", "ROLE_SUPER_ADMIN"));
        when(memberRepo.findById("mod1")).thenReturn(Optional.of(Member.builder().id("mod1").build()));
        when(memberRepo.findById("mod2")).thenReturn(Optional.of(Member.builder().id("mod2").build()));
        when(memberRepo.findById("user")).thenReturn(Optional.of(Member.builder().id("user").build()));
        when(memberRepo.findById("ghost")).thenReturn(Optional.empty());
        when(memberRepo.roleNamesOf("mod1")).thenReturn(List.of("ADMIN"));
        when(memberRepo.roleNamesOf("mod2")).thenReturn(List.of("ADMIN"));
        when(memberRepo.roleNamesOf("user")).thenReturn(List.of("USER"));
        when(suspensions.findActive(any(), any())).thenReturn(List.of());

        var results = service.suspendRolePlans(List.of("mod1", "mod2", "user", "ghost"), 3, "dọn dẹp");

        assertEquals(List.of("SUSPENDED", "SUSPENDED", "SKIPPED", "FAILED"),
                results.stream().map(r -> r.getStatus()).toList());
        verify(suspensions, times(2)).save(any());

        var lifted = service.liftRolePlanSuspensions(List.of("mod1", "user"));
        assertEquals(List.of("LIFTED", "SKIPPED"), lifted.stream().map(r -> r.getStatus()).toList());

        AppException e = assertThrows(AppException.class, () -> service.suspendRolePlans(List.of(), 1, null));
        assertEquals(ErrorCode.INVALID_REQUEST, e.getErrorCode());
    }
}
