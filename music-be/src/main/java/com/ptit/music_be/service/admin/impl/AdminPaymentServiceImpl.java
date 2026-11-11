package com.ptit.music_be.service.admin.impl;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.PaymentKind;
import com.ptit.music_be.dto.enums.PaymentStatus;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.PaymentOrderResponse;
import com.ptit.music_be.dto.response.RevenueResponse;
import com.ptit.music_be.entity.PaymentOrder;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PaymentOrderRepository;
import com.ptit.music_be.service.admin.AdminPaymentService;
import com.ptit.music_be.service.billing.SubscriptionService;
import com.ptit.music_be.service.payment.impl.PaymentServiceImpl;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@PreAuthorize("hasRole('ADMIN')")
public class AdminPaymentServiceImpl implements AdminPaymentService {

    static final int MAX_DAYS = 366;
    static final int DEFAULT_DAYS = 30;
    static final int MAX_PAGE_SIZE = 100;

    PaymentOrderRepository orderRepository;
    SubscriptionService subscriptionService;

    @Override
    @Transactional(readOnly = true)
    public RevenueResponse revenue(LocalDate from, LocalDate to) {
        LocalDate end = to == null ? LocalDate.now() : to;
        LocalDate start = from == null ? end.minusDays(DEFAULT_DAYS - 1L) : from;
        if (start.isAfter(end) || ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS) {
            throw new AppException(ErrorCode.PAYMENT_RANGE_INVALID);
        }
        List<PaymentOrder> orders = orderRepository.findPaidBetween(
                EnumSet.of(PaymentStatus.PAID, PaymentStatus.REFUNDED),
                start.atStartOfDay(),
                end.plusDays(1).atStartOfDay());

        Map<LocalDate, long[]> days = new LinkedHashMap<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            days.put(d, new long[] {0, 0});
        }
        Map<String, Object[]> plans = new LinkedHashMap<>();
        long total = 0;
        long count = 0;
        long refunded = 0;
        long refundedCount = 0;
        for (PaymentOrder o : orders) {
            if (o.getStatus() == PaymentStatus.REFUNDED) {
                refunded += o.getAmount();
                refundedCount++;
                continue;
            }
            total += o.getAmount();
            count++;
            long[] day = days.get(o.getPaidAt().toLocalDate());
            if (day != null) {
                day[0] += o.getAmount();
                day[1]++;
            }
            Object[] plan = plans.computeIfAbsent(
                    o.getPlan().getCode(), k -> new Object[] {o.getPlan().getName(), 0L, 0L});
            plan[1] = (Long) plan[1] + o.getAmount();
            plan[2] = (Long) plan[2] + 1;
        }
        List<RevenueResponse.Day> byDay = new ArrayList<>();
        days.forEach((d, v) -> byDay.add(new RevenueResponse.Day(d, v[0], v[1])));
        List<RevenueResponse.ByPlan> byPlan = new ArrayList<>();
        plans.forEach((code, v) ->
                byPlan.add(new RevenueResponse.ByPlan(code, (String) v[0], (Long) v[1], (Long) v[2])));
        return RevenueResponse.builder()
                .from(start)
                .to(end)
                .totalAmount(total)
                .orderCount(count)
                .refundedAmount(refunded)
                .refundedCount(refundedCount)
                .byDay(byDay)
                .byPlan(byPlan)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<PaymentOrderResponse> orders(PaymentStatus status, PaymentKind kind, int page, int size) {
        int safeSize = size <= 0 ? 20 : Math.min(size, MAX_PAGE_SIZE);
        PageRequest pageable = PageRequest.of(Math.max(page, 0), safeSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<PaymentOrder> result = orderRepository.search(status, kind, pageable);
        return PageResponse.<PaymentOrderResponse>builder()
                .content(result.getContent().stream()
                        .map(o -> PaymentServiceImpl.toResponse(o, true))
                        .toList())
                .pageNumber(result.getNumber())
                .pageSize(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @Override
    @Transactional
    public PaymentOrderResponse refund(String orderId) {
        PaymentOrder order = orderRepository
                .findByIdForUpdate(orderId)
                .orElseThrow(() -> new AppException(ErrorCode.PAYMENT_ORDER_NOT_EXISTED));
        if (order.getStatus() != PaymentStatus.PAID) {
            throw new AppException(ErrorCode.PAYMENT_ORDER_NOT_REFUNDABLE);
        }
        order.setStatus(PaymentStatus.REFUNDED);
        orderRepository.save(order);
        subscriptionService.revoke(order.getMember().getId(), order.getPlan(), order.getPeriod().duration());
        return PaymentServiceImpl.toResponse(order, true);
    }
}
