package com.ptit.music_be.service.billing.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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
import com.ptit.music_be.repository.PlanSanctionRepository;
import com.ptit.music_be.repository.SubscriptionRepository;
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
    private final PlanSanctionRepository sanctions = mock(PlanSanctionRepository.class);
    private final SubscriptionServiceImpl service = new SubscriptionServiceImpl(
            plans,
            subs,
            mock(com.ptit.music_be.repository.AiTaskRepository.class),
            memberRepo,
            new PlanLimitsParser(new ObjectMapper()),
            notifications,
            sanctions);

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
    void revokeCancelsPaidPlanRecordsItAndNotifies() {
        loginSuper();
        Plan premium = Plan.builder().id("premium").code("PREMIUM").name("Premium").sortOrder(4).limits("{}").build();
        Member buyer = Member.builder().id("buyer").build();
        Subscription sub = current(premium, LocalDateTime.now().plusMonths(3));
        when(memberRepo.findById("buyer")).thenReturn(Optional.of(buyer));
        when(memberRepo.findById("freeUser")).thenReturn(Optional.of(Member.builder().id("freeUser").build()));
        when(memberRepo.findById("boss")).thenReturn(Optional.of(Member.builder().id("boss").build()));
        when(memberRepo.roleNamesOf("boss")).thenReturn(List.of("ADMIN", "SUPER_ADMIN"));
        when(subs.findCurrent(eq("buyer"), any())).thenReturn(List.of(sub));
        when(subs.findCurrent(eq("freeUser"), any())).thenReturn(List.of());

        var results = service.revokePlans(List.of("buyer", "freeUser", "boss", "ghost"), " spam ");

        assertEquals(List.of("REVOKED", "SKIPPED", "SKIPPED", "FAILED"),
                results.stream().map(r -> r.getStatus()).toList());
        assertEquals(SubscriptionStatus.CANCELED, sub.getStatus());
        org.mockito.ArgumentCaptor<com.ptit.music_be.entity.PlanSanction> saved =
                org.mockito.ArgumentCaptor.forClass(com.ptit.music_be.entity.PlanSanction.class);
        verify(sanctions).save(saved.capture());
        assertEquals("REVOKE", saved.getValue().getType());
        assertEquals(buyer, saved.getValue().getMember());
        assertEquals(sub, saved.getValue().getSubscription());
        assertEquals("spam", saved.getValue().getReason());
        verify(notifications).notify(eq(buyer), any(), eq(NotificationType.PLAN_REVOKED), any(), any(), any());
    }

    private static Plan planOf(String id, String code, int order) {
        return Plan.builder().id(id).code(code).name(code).sortOrder(order).limits("{}").build();
    }

    private static com.ptit.music_be.entity.PlanSanction banOf(String memberId, Plan plan, LocalDateTime until) {
        return com.ptit.music_be.entity.PlanSanction.builder()
                .member(Member.builder().id(memberId).build())
                .type("BAN")
                .plan(plan)
                .startsAt(LocalDateTime.now().minusDays(1))
                .endsAt(until)
                .build();
    }

    @Test
    void banOnlyBlocksTheBannedPlan() {
        Plan free = planOf("free", "FREE", 1);
        Plan proPlan = planOf("pro", "PRO", 3);
        Plan premium = planOf("premium", "PREMIUM", 4);
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(proPlan));
        when(memberRepo.roleNamesOf("mod")).thenReturn(List.of("ADMIN"));
        when(subs.findCurrentOne(eq("mod"), any()))
                .thenReturn(Optional.of(current(premium, LocalDateTime.now().plusMonths(2))));
        LocalDateTime until = LocalDateTime.now().plusMonths(1);

        // ADMIN có Pro theo vai trò + Premium đã mua: cấm Premium thì còn Pro
        when(sanctions.findActiveBans(eq("mod"), any())).thenReturn(List.of(banOf("mod", premium, until)));
        assertEquals("PRO", service.currentPlan("mod").getCode());
        assertEquals(until, service.planBannedUntil("mod", "PREMIUM"));
        assertNull(service.planBannedUntil("mod", "PRO"));

        // Cấm cả hai thì về Free
        when(sanctions.findActiveBans(eq("mod"), any()))
                .thenReturn(List.of(banOf("mod", premium, until), banOf("mod", proPlan, until)));
        assertEquals("FREE", service.currentPlan("mod").getCode());

        // Hết cấm thì dùng lại Premium
        when(sanctions.findActiveBans(eq("mod"), any())).thenReturn(List.of());
        assertEquals("PREMIUM", service.currentPlan("mod").getCode());
    }

    @Test
    void banCurrentPlanOrChosenPlanAndLift() {
        loginSuper();
        Plan free = planOf("free", "FREE", 1);
        Plan proPlan = planOf("pro", "PRO", 3);
        Plan premium = planOf("premium", "PREMIUM", 4);
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(proPlan));
        Member user = Member.builder().id("user").build();
        when(memberRepo.findById("user")).thenReturn(Optional.of(user));
        when(memberRepo.findById("freeUser")).thenReturn(Optional.of(Member.builder().id("freeUser").build()));
        when(memberRepo.findById("boss")).thenReturn(Optional.of(Member.builder().id("boss").build()));
        when(memberRepo.roleNamesOf("boss")).thenReturn(List.of("ADMIN", "SUPER_ADMIN"));
        when(subs.findCurrentOne(eq("user"), any()))
                .thenReturn(Optional.of(current(premium, LocalDateTime.now().plusMonths(2))));
        when(subs.findCurrentOne(eq("freeUser"), any())).thenReturn(Optional.empty());
        var old = banOf("user", premium, LocalDateTime.now().plusDays(3));
        when(sanctions.findActiveBans(eq("user"), any())).thenReturn(List.of(old));

        // Không chọn gói: cấm gói đang dùng. Lệnh cũ cùng gói bị thay; người dùng Free và SUPER_ADMIN bỏ qua
        when(sanctions.findActiveBans(eq("user"), any())).thenReturn(List.of());
        var results = service.banPlans(List.of("user", "freeUser", "boss"), 3, null, null);
        assertEquals(List.of("BANNED", "SKIPPED", "SKIPPED"), results.stream().map(r -> r.getStatus()).toList());
        org.mockito.ArgumentCaptor<com.ptit.music_be.entity.PlanSanction> saved =
                org.mockito.ArgumentCaptor.forClass(com.ptit.music_be.entity.PlanSanction.class);
        verify(sanctions).save(saved.capture());
        assertEquals("PREMIUM", saved.getValue().getPlan().getCode());
        verify(notifications).notify(eq(user), any(), eq(NotificationType.PLAN_BANNED), any(), any(), any());

        // Chọn gói: cấm đúng gói đó, lệnh cũ cùng gói được thay
        when(plans.findByCode("PREMIUM")).thenReturn(Optional.of(premium));
        when(sanctions.findActiveBans(eq("user"), any())).thenReturn(List.of(old));
        assertEquals("BANNED", service.banPlans(List.of("user"), 1, "spam", "premium").getFirst().getStatus());
        assertNotNull(old.getLiftedAt());

        AppException e = assertThrows(AppException.class, () -> service.banPlans(List.of("user"), 0, null, null));
        assertEquals(ErrorCode.PLAN_SANCTION_INVALID, e.getErrorCode());
        e = assertThrows(AppException.class, () -> service.banPlans(List.of("user"), 1, null, "FREE"));
        assertEquals(ErrorCode.PLAN_SANCTION_INVALID, e.getErrorCode());

        var active = banOf("user", premium, LocalDateTime.now().plusDays(1));
        when(sanctions.findActiveBans(eq("user"), any())).thenReturn(List.of(active));
        assertEquals("LIFTED", service.liftBans(List.of("user")).getFirst().getStatus());
        assertNotNull(active.getLiftedAt());
    }

    @Test
    void bannedPlanCannotBeGrantedButOtherPlansCan() {
        Plan proPlan = planOf("pro", "PRO", 3);
        Plan premium = planOf("premium", "PREMIUM", 4);
        when(plans.findByCode("PREMIUM")).thenReturn(Optional.of(premium));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(proPlan));
        Member user = Member.builder().id("user").build();
        when(memberRepo.findById("user")).thenReturn(Optional.of(user));
        when(sanctions.findActiveBans(eq("user"), any()))
                .thenReturn(List.of(banOf("user", premium, LocalDateTime.now().plusDays(5))));
        when(subs.findCurrentOne(eq("user"), any())).thenReturn(Optional.empty());

        AppException e = assertThrows(AppException.class, () -> service.grant("user", "PREMIUM", 1));
        assertEquals(ErrorCode.PLAN_BANNED, e.getErrorCode());
        assertEquals("SKIPPED", service.grantMany(List.of("user"), "PREMIUM", 1).getFirst().getStatus());
        assertEquals("GRANTED", service.grantMany(List.of("user"), "PRO", 1).getFirst().getStatus());
    }


    @Test
    void chosenPlanIsOnlyBannedForMembersWhoHoldIt() {
        loginSuper();
        Plan free = planOf("free", "FREE", 1);
        Plan proPlan = planOf("pro", "PRO", 3);
        Plan premium = planOf("premium", "PREMIUM", 4);
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));
        when(plans.findByCode("PRO")).thenReturn(Optional.of(proPlan));
        when(plans.findByCode("PREMIUM")).thenReturn(Optional.of(premium));
        when(memberRepo.findById("buyer")).thenReturn(Optional.of(Member.builder().id("buyer").build()));
        when(memberRepo.findById("proUser")).thenReturn(Optional.of(Member.builder().id("proUser").build()));
        when(memberRepo.findById("mod")).thenReturn(Optional.of(Member.builder().id("mod").build()));
        when(memberRepo.roleNamesOf("mod")).thenReturn(List.of("ADMIN"));
        when(subs.findCurrentOne(eq("buyer"), any()))
                .thenReturn(Optional.of(current(premium, LocalDateTime.now().plusMonths(1))));
        when(subs.findCurrentOne(eq("proUser"), any()))
                .thenReturn(Optional.of(current(proPlan, LocalDateTime.now().plusMonths(1))));
        when(subs.findCurrentOne(eq("mod"), any()))
                .thenReturn(Optional.of(current(premium, LocalDateTime.now().plusMonths(1))));
        when(sanctions.findActiveBans(any(), any())).thenReturn(List.of());

        // Cấm Premium: người mua Premium và ADMIN có Premium bị cấm; người dùng Pro không có Premium thì bỏ qua
        var premiumBan = service.banPlans(List.of("buyer", "proUser", "mod"), 1, null, "PREMIUM");
        assertEquals(List.of("BANNED", "SKIPPED", "BANNED"), premiumBan.stream().map(r -> r.getStatus()).toList());

        // Cấm Pro: ADMIN có Pro theo vai trò nên bị cấm; người chỉ có Premium thì bỏ qua
        var proBan = service.banPlans(List.of("buyer", "mod"), 1, null, "PRO");
        assertEquals(List.of("SKIPPED", "BANNED"), proBan.stream().map(r -> r.getStatus()).toList());
    }


    private void loginSuper() {
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(new org.springframework.security.authentication.TestingAuthenticationToken(
                        "boss@x.com", "x", "ROLE_ADMIN", "ROLE_SUPER_ADMIN"));
    }
}
