package com.ptit.music_be.service.payment.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.enums.BillingPeriod;
import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.dto.enums.PaymentStatus;
import com.ptit.music_be.dto.enums.SubscriptionSource;
import com.ptit.music_be.dto.request.CreatePaymentOrderRequest;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PaymentOrder;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PaymentOrderRepository;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.service.billing.SubscriptionService;
import com.ptit.music_be.service.payment.PaymentProvider;
import com.ptit.music_be.service.payment.PaymentProvider.PaymentCallback;
import com.ptit.music_be.service.payment.PaymentService.IpnResult;

class PaymentServiceImplTest {

    private final PaymentOrderRepository orders = mock(PaymentOrderRepository.class);
    private final PlanRepository plans = mock(PlanRepository.class);
    private final MemberRepository members = mock(MemberRepository.class);
    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final PaymentProvider provider = mock(PaymentProvider.class);
    private PaymentServiceImpl service;

    private final Member buyer = Member.builder().id("m").email("a@x.com").build();
    private final Plan pro = Plan.builder().id("p").code("PRO").name("Pro").priceMonth(99000).priceYear(990000).build();
    private PaymentOrder order;

    @BeforeEach
    void setUp() {
        when(provider.type()).thenReturn(PaymentProviderType.VNPAY);
        when(provider.isConfigured()).thenReturn(true);
        service = new PaymentServiceImpl(
                orders, plans, members, subscriptions, new ObjectMapper(), List.of(provider));
        order = PaymentOrder.builder()
                .orderCode("MU1")
                .member(buyer)
                .plan(pro)
                .period(BillingPeriod.MONTH)
                .amount(99000)
                .provider(PaymentProviderType.VNPAY)
                .status(PaymentStatus.PENDING)
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .build();
        when(orders.findByOrderCodeForUpdate("MU1")).thenReturn(Optional.of(order));
    }

    private void callback(boolean valid, String code, long amount, boolean success) {
        when(provider.parseCallback(any())).thenReturn(new PaymentCallback(valid, code, amount, "TXN1", success));
    }

    @Test
    void successfulIpnMarksPaidAndActivatesPlanOnce() {
        callback(true, "MU1", 99000, true);

        assertEquals(IpnResult.OK, service.handleIpn(PaymentProviderType.VNPAY, Map.of()));
        assertEquals(PaymentStatus.PAID, order.getStatus());
        assertEquals("TXN1", order.getProviderTxnId());
        verify(subscriptions).activate(eq(buyer), eq(pro), eq(BillingPeriod.MONTH.duration()), eq(SubscriptionSource.PAYMENT));

        // Cổng gọi lại lần hai: không kích hoạt thêm
        assertEquals(IpnResult.ALREADY_CONFIRMED, service.handleIpn(PaymentProviderType.VNPAY, Map.of()));
        verify(subscriptions, times(1)).activate(any(), any(), any(), any());
    }

    @Test
    void invalidSignatureTouchesNothing() {
        callback(false, null, 0, false);

        assertEquals(IpnResult.INVALID_SIGNATURE, service.handleIpn(PaymentProviderType.VNPAY, Map.of()));
        verify(orders, never()).findByOrderCodeForUpdate(any());
        verify(subscriptions, never()).activate(any(), any(), any(), any());
    }

    @Test
    void wrongAmountIsRejectedAndOrderStaysPending() {
        callback(true, "MU1", 1000, true);

        assertEquals(IpnResult.INVALID_AMOUNT, service.handleIpn(PaymentProviderType.VNPAY, Map.of()));
        assertEquals(PaymentStatus.PENDING, order.getStatus());
        verify(subscriptions, never()).activate(any(), any(), any(), any());
    }

    @Test
    void unknownOrderIsReported() {
        callback(true, "NOPE", 99000, true);
        when(orders.findByOrderCodeForUpdate("NOPE")).thenReturn(Optional.empty());

        assertEquals(IpnResult.ORDER_NOT_FOUND, service.handleIpn(PaymentProviderType.VNPAY, Map.of()));
    }

    @Test
    void failedPaymentMarksFailedWithoutActivating() {
        callback(true, "MU1", 99000, false);

        assertEquals(IpnResult.OK, service.handleIpn(PaymentProviderType.VNPAY, Map.of()));
        assertEquals(PaymentStatus.FAILED, order.getStatus());
        assertNull(order.getProviderTxnId());
        verify(subscriptions, never()).activate(any(), any(), any(), any());
    }

    @Test
    void lateSuccessOnExpiredOrderStillActivates() {
        order.setStatus(PaymentStatus.EXPIRED);
        callback(true, "MU1", 99000, true);

        assertEquals(IpnResult.OK, service.handleIpn(PaymentProviderType.VNPAY, Map.of()));
        assertEquals(PaymentStatus.PAID, order.getStatus());
        verify(subscriptions).activate(any(), any(), any(), any());
    }

    @Test
    void refundedOrderIsNotReactivatedByRepeatedIpn() {
        order.setStatus(PaymentStatus.REFUNDED);
        callback(true, "MU1", 99000, true);

        assertEquals(IpnResult.ALREADY_CONFIRMED, service.handleIpn(PaymentProviderType.VNPAY, Map.of()));
        verify(subscriptions, never()).activate(any(), any(), any(), any());
    }

    @Test
    void createOrderFailsWhenProviderNotConfigured() {
        when(provider.isConfigured()).thenReturn(false);

        AppException e = assertThrows(
                AppException.class,
                () -> service.createOrder(new CreatePaymentOrderRequest("PRO", BillingPeriod.MONTH, null), "1.1.1.1"));
        assertEquals(ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE, e.getErrorCode());
    }

    @Test
    void freePlanCannotBePurchased() {
        Plan free = Plan.builder().code("FREE").priceMonth(0).priceYear(0).build();
        when(plans.findByCode("FREE")).thenReturn(Optional.of(free));

        AppException e = assertThrows(
                AppException.class,
                () -> service.createOrder(new CreatePaymentOrderRequest("FREE", BillingPeriod.YEAR, null), "1.1.1.1"));
        assertEquals(ErrorCode.PAYMENT_PLAN_NOT_PURCHASABLE, e.getErrorCode());
    }

    @Test
    void expirePendingMarksOverdueOrders() {
        order.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(orders.findByStatusAndExpiresAtBefore(eq(PaymentStatus.PENDING), any())).thenReturn(List.of(order));

        assertEquals(1, service.expirePending());
        assertEquals(PaymentStatus.EXPIRED, order.getStatus());
    }

    @Test
    void expirePendingActivatesPlanWhenGatewayReportsPayment() {
        order.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(orders.findByStatusAndExpiresAtBefore(eq(PaymentStatus.PENDING), any())).thenReturn(List.of(order));
        when(provider.queryTransaction(order))
                .thenReturn(Optional.of(new PaymentCallback(true, "MU1", 99000, "TXN9", true)));

        service.expirePending();

        assertEquals(PaymentStatus.PAID, order.getStatus());
        verify(subscriptions, times(1)).activate(any(), any(), any(), eq(SubscriptionSource.PAYMENT));
    }

    @Test
    void expirePendingIgnoresGatewayAnswerWithWrongAmount() {
        order.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(orders.findByStatusAndExpiresAtBefore(eq(PaymentStatus.PENDING), any())).thenReturn(List.of(order));
        when(provider.queryTransaction(order))
                .thenReturn(Optional.of(new PaymentCallback(true, "MU1", 1000, "TXN9", true)));

        service.expirePending();

        assertEquals(PaymentStatus.EXPIRED, order.getStatus());
        verify(subscriptions, never()).activate(any(), any(), any(), any());
    }

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void confirmReturnWithValidSignatureActivatesPlanAndReturnsOrder() {
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken("a@x.com", null, List.of()));
        when(orders.findByOrderCode("MU1")).thenReturn(Optional.of(order));
        callback(true, "MU1", 99000, true);

        var result = service.confirmReturn(PaymentProviderType.VNPAY, Map.of("vnp_TxnRef", "MU1"));

        assertEquals("PAID", result.getStatus());
        verify(subscriptions, times(1)).activate(any(), any(), any(), eq(SubscriptionSource.PAYMENT));
    }

    @Test
    void confirmReturnWithBadSignatureIsRejected() {
        callback(false, null, 0, false);

        assertThrows(
                AppException.class,
                () -> service.confirmReturn(PaymentProviderType.VNPAY, Map.of("vnp_TxnRef", "MU1")));
        verify(subscriptions, never()).activate(any(), any(), any(), any());
    }

    private void loginAsBuyer() {
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken("a@x.com", null, List.of()));
    }

    @Test
    void buyingSamePlanAgainReusesPendingOrderInsteadOfCreatingSecondRow() {
        loginAsBuyer();
        when(plans.findByCode("PRO")).thenReturn(Optional.of(pro));
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(buyer));
        when(orders.findByMemberEmailOrderByCreatedAtDesc("a@x.com")).thenReturn(List.of(order));
        when(provider.createPayment(any(), any())).thenReturn(new PaymentProvider.PaymentInit("https://pay/url"));

        var result = service.createOrder(new CreatePaymentOrderRequest("PRO", BillingPeriod.MONTH, null), "1.1.1.1");

        assertEquals("MU1", result.getOrderCode());
        assertEquals("https://pay/url", result.getPayUrl());
        verify(orders, never()).save(argThat(o -> !o.getOrderCode().equals("MU1")));
    }

    @Test
    void buyingDifferentPlanSupersedesOldPendingOrder() {
        loginAsBuyer();
        Plan team = Plan.builder().id("t").code("TEAM").name("Team").priceMonth(199000).priceYear(1990000).build();
        when(plans.findByCode("TEAM")).thenReturn(Optional.of(team));
        when(members.findByEmail("a@x.com")).thenReturn(Optional.of(buyer));
        when(orders.findByMemberEmailOrderByCreatedAtDesc("a@x.com")).thenReturn(List.of(order));
        when(orders.save(any())).thenAnswer(i -> i.getArgument(0));
        when(provider.createPayment(any(), any())).thenReturn(new PaymentProvider.PaymentInit("https://pay/url"));

        var result = service.createOrder(new CreatePaymentOrderRequest("TEAM", BillingPeriod.MONTH, null), "1.1.1.1");

        assertEquals(PaymentStatus.EXPIRED, order.getStatus());
        assertEquals("TEAM", result.getPlanCode());
    }

    @Test
    void resumeReturnsPayUrlForPendingOrderAndRejectsExpiredOne() {
        loginAsBuyer();
        when(provider.createPayment(any(), any())).thenReturn(new PaymentProvider.PaymentInit("https://pay/again"));

        assertEquals("https://pay/again", service.resumeOrder("MU1", "1.1.1.1").getPayUrl());

        order.setStatus(PaymentStatus.EXPIRED);
        AppException e = assertThrows(AppException.class, () -> service.resumeOrder("MU1", "1.1.1.1"));
        assertEquals(ErrorCode.PAYMENT_ORDER_NOT_PAYABLE, e.getErrorCode());
    }

    @Test
    void historyHidesAbandonedOrders() {
        loginAsBuyer();
        PaymentOrder expired = PaymentOrder.builder()
                .orderCode("MU2").member(buyer).plan(pro).period(BillingPeriod.MONTH).amount(99000)
                .provider(PaymentProviderType.VNPAY).status(PaymentStatus.EXPIRED)
                .expiresAt(LocalDateTime.now().minusDays(1)).build();
        when(orders.findByMemberEmailOrderByCreatedAtDesc("a@x.com")).thenReturn(List.of(order, expired));

        var history = service.listMyOrders();

        assertEquals(1, history.size());
        assertEquals("MU1", history.get(0).getOrderCode());
    }
}
