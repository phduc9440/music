package com.ptit.music_be.service.billing.impl;

import java.time.LocalDateTime;
import java.time.Period;
import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.SubscriptionSource;
import com.ptit.music_be.dto.enums.SubscriptionStatus;
import com.ptit.music_be.dto.enums.UsageMetric;
import com.ptit.music_be.dto.response.MySubscriptionResponse;
import com.ptit.music_be.dto.response.PlanResponse;
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
import com.ptit.music_be.service.billing.SubscriptionService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class SubscriptionServiceImpl implements SubscriptionService {

    public static final String FREE = "FREE";
    static final int MAX_GRANT_DAYS = 3650;

    PlanRepository planRepository;
    SubscriptionRepository subscriptionRepository;
    UsageCounterRepository usageCounterRepository;
    MemberRepository memberRepository;
    PlanLimitsParser limitsParser;

    @Override
    @Transactional(readOnly = true)
    public List<PlanResponse> listPlans() {
        return planRepository.findAllByOrderBySortOrderAsc().stream()
                .map(this::toPlanResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public MySubscriptionResponse mine() {
        Member member = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        Subscription current =
                subscriptionRepository.findCurrentOne(member.getId(), LocalDateTime.now()).orElse(null);
        int used = usageCounterRepository
                .findByMemberIdAndMetricAndPeriod(
                        member.getId(), UsageMetric.OMR_PAGES, java.time.YearMonth.now().toString())
                .map(u -> u.getUsed())
                .orElse(0);
        return toMine(current, current == null ? freePlan() : current.getPlan(), used);
    }

    @Override
    @Transactional(readOnly = true)
    public Plan currentPlan(String memberId) {
        return subscriptionRepository
                .findCurrentOne(memberId, LocalDateTime.now())
                .map(Subscription::getPlan)
                .orElseGet(this::freePlan);
    }

    @Override
    @Transactional
    public void activate(Member member, Plan plan, Period duration, SubscriptionSource source) {
        LocalDateTime now = LocalDateTime.now();
        Subscription current =
                subscriptionRepository.findCurrentOne(member.getId(), now).orElse(null);
        if (current != null && current.getPlan().getId().equals(plan.getId())) {
            current.setExpiresAt(current.getExpiresAt().plus(duration));
            subscriptionRepository.save(current);
            return;
        }
        if (current != null) {
            current.setStatus(SubscriptionStatus.CANCELED);
            current.setExpiresAt(now);
            subscriptionRepository.save(current);
        }
        subscriptionRepository.save(Subscription.builder()
                .member(member)
                .plan(plan)
                .status(SubscriptionStatus.ACTIVE)
                .source(source)
                .startsAt(now)
                .expiresAt(now.plus(duration))
                .build());
    }

    @Override
    @Transactional
    public void revoke(String memberId, Plan plan, Period duration) {
        LocalDateTime now = LocalDateTime.now();
        Subscription current = subscriptionRepository.findCurrentOne(memberId, now).orElse(null);
        if (current == null || !current.getPlan().getId().equals(plan.getId())) {
            return;
        }
        LocalDateTime reduced = current.getExpiresAt().minus(duration);
        if (reduced.isAfter(now)) {
            current.setExpiresAt(reduced);
        } else {
            current.setStatus(SubscriptionStatus.CANCELED);
            current.setExpiresAt(now);
        }
        subscriptionRepository.save(current);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public MySubscriptionResponse grant(String memberId, String planCode, int days) {
        if (days < 1 || days > MAX_GRANT_DAYS) {
            throw new AppException(ErrorCode.SUBSCRIPTION_DAYS_INVALID);
        }
        Member member =
                memberRepository.findById(memberId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        Plan plan = planRepository.findByCode(planCode).orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
        if (FREE.equals(plan.getCode())) {
            // Cấp Free = bỏ gói đang có
            cancel(memberId);
            return toMine(null, plan, 0);
        }
        activate(member, plan, Period.ofDays(days), SubscriptionSource.ADMIN_GRANT);
        Subscription current =
                subscriptionRepository.findCurrentOne(memberId, LocalDateTime.now()).orElseThrow();
        return toMine(current, plan, 0);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public void cancel(String memberId) {
        LocalDateTime now = LocalDateTime.now();
        for (Subscription s : subscriptionRepository.findCurrent(memberId, now)) {
            s.setStatus(SubscriptionStatus.CANCELED);
            s.setExpiresAt(now);
            subscriptionRepository.save(s);
        }
    }

    @Override
    @Transactional
    public int expireDue() {
        List<Subscription> due =
                subscriptionRepository.findByStatusAndExpiresAtBefore(SubscriptionStatus.ACTIVE, LocalDateTime.now());
        due.forEach(s -> s.setStatus(SubscriptionStatus.EXPIRED));
        subscriptionRepository.saveAll(due);
        return due.size();
    }

    private Plan freePlan() {
        return planRepository.findByCode(FREE).orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
    }

    private MySubscriptionResponse toMine(Subscription s, Plan plan, int omrPagesUsed) {
        return MySubscriptionResponse.builder()
                .plan(toPlanResponse(plan))
                .status(s == null ? "FREE" : "ACTIVE")
                .source(s == null ? null : s.getSource().name())
                .startsAt(s == null ? null : s.getStartsAt())
                .expiresAt(s == null ? null : s.getExpiresAt())
                .omrPagesUsed(omrPagesUsed)
                .build();
    }

    private PlanResponse toPlanResponse(Plan plan) {
        return PlanResponse.builder()
                .code(plan.getCode())
                .name(plan.getName())
                .priceMonth(plan.getPriceMonth())
                .priceYear(plan.getPriceYear())
                .limits(limitsParser.parse(plan))
                .build();
    }
}
