package com.ptit.music_be.service.admin.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.ptit.music_be.dto.enums.BillingPeriod;
import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.dto.enums.PaymentStatus;
import com.ptit.music_be.dto.response.RevenueResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PaymentOrder;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PaymentOrderRepository;
import com.ptit.music_be.service.billing.SubscriptionService;

class AdminPaymentServiceImplTest {

    private final PaymentOrderRepository orders = mock(PaymentOrderRepository.class);
    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final AdminPaymentServiceImpl service = new AdminPaymentServiceImpl(orders, subscriptions);

    private final Member buyer = Member.builder().id("m").email("a@x.com").build();
    private final Plan pro = Plan.builder().id("p").code("PRO").name("Pro").build();

    private PaymentOrder order(PaymentStatus status, long amount, LocalDateTime paidAt) {
        return PaymentOrder.builder()
                .id("o")
                .member(buyer)
                .plan(pro)
                .period(BillingPeriod.MONTH)
                .amount(amount)
                .provider(PaymentProviderType.VNPAY)
                .status(status)
                .paidAt(paidAt)
                .build();
    }

    @Test
    void refundMarksRefundedAndRevokesPlanTime() {
        PaymentOrder o = order(PaymentStatus.PAID, 99000, LocalDateTime.now());
        when(orders.findByIdForUpdate("o")).thenReturn(Optional.of(o));

        service.refund("o");

        assertEquals(PaymentStatus.REFUNDED, o.getStatus());
        verify(subscriptions).revoke("m", pro, BillingPeriod.MONTH.duration());
    }

    @Test
    void refundRejectsOrdersThatWereNotPaid() {
        PaymentOrder o = order(PaymentStatus.PENDING, 99000, null);
        when(orders.findByIdForUpdate("o")).thenReturn(Optional.of(o));

        AppException e = assertThrows(AppException.class, () -> service.refund("o"));

        assertEquals(ErrorCode.PAYMENT_ORDER_NOT_REFUNDABLE, e.getErrorCode());
        verify(subscriptions, never()).revoke(any(), any(), any());
    }

    @Test
    void revenueSeparatesPaidFromRefundedAndFillsEmptyDays() {
        LocalDate today = LocalDate.now();
        when(orders.findPaidBetween(any(), any(), any()))
                .thenReturn(List.of(
                        order(PaymentStatus.PAID, 99000, today.atTime(10, 0)),
                        order(PaymentStatus.PAID, 990000, today.atTime(11, 0)),
                        order(PaymentStatus.REFUNDED, 99000, today.minusDays(1).atTime(9, 0))));

        RevenueResponse r = service.revenue(today.minusDays(2), today);

        assertEquals(1089000, r.getTotalAmount());
        assertEquals(2, r.getOrderCount());
        assertEquals(99000, r.getRefundedAmount());
        assertEquals(1, r.getRefundedCount());
        assertEquals(3, r.getByDay().size());
        assertEquals(1089000, r.getByDay().get(2).amount());
        assertEquals(0, r.getByDay().get(0).amount());
        assertEquals("PRO", r.getByPlan().get(0).planCode());
        assertEquals(2, r.getByPlan().get(0).count());
    }

    @Test
    void revenueRejectsTooLongOrReversedRange() {
        LocalDate today = LocalDate.now();

        assertEquals(
                ErrorCode.PAYMENT_RANGE_INVALID,
                assertThrows(AppException.class, () -> service.revenue(today.minusDays(400), today)).getErrorCode());
        assertEquals(
                ErrorCode.PAYMENT_RANGE_INVALID,
                assertThrows(AppException.class, () -> service.revenue(today, today.minusDays(1))).getErrorCode());
    }
}
