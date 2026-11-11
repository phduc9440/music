package com.ptit.music_be.service.billing.impl;

import java.time.YearMonth;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.UsageMetric;
import com.ptit.music_be.dto.response.PlanLimitPayload;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.entity.UsageCounter;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.repository.UsageCounterRepository;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.billing.PlanLimitsParser;
import com.ptit.music_be.service.billing.SubscriptionService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class EntitlementServiceImpl implements EntitlementService {

    SubscriptionService subscriptionService;
    PlanLimitsParser limitsParser;
    UsageCounterRepository usageCounterRepository;
    PlanRepository planRepository;

    @Override
    @Transactional(readOnly = true)
    public PlanLimits limitsOf(String memberId) {
        return limitsParser.parse(subscriptionService.currentPlan(memberId));
    }

    @Override
    @Transactional
    public void checkAndConsume(String memberId, UsageMetric metric, int amount) {
        if (amount <= 0) {
            return;
        }
        Plan plan = subscriptionService.currentPlan(memberId);
        Integer limit = limitFor(limitsParser.parse(plan), metric);
        String period = YearMonth.now().toString();
        UsageCounter counter = usageCounterRepository
                .findForUpdate(memberId, metric, period)
                .orElseGet(() -> usageCounterRepository.save(UsageCounter.builder()
                        .memberId(memberId)
                        .metric(metric)
                        .period(period)
                        .used(0)
                        .build()));
        if (limit != null && counter.getUsed() + amount > limit) {
            throw new AppException(
                    ErrorCode.PLAN_LIMIT_REACHED,
                    new PlanLimitPayload(metric.name(), limit, counter.getUsed(), upgradeTo(plan)));
        }
        counter.setUsed(counter.getUsed() + amount);
        usageCounterRepository.save(counter);
    }

    @Override
    @Transactional
    public void release(String memberId, UsageMetric metric, int amount, String period) {
        usageCounterRepository.findForUpdate(memberId, metric, period).ifPresent(c -> {
            c.setUsed(Math.max(0, c.getUsed() - amount));
            usageCounterRepository.save(c);
        });
    }

    @Override
    @Transactional(readOnly = true)
    public int usedThisMonth(String memberId, UsageMetric metric) {
        return usageCounterRepository
                .findByMemberIdAndMetricAndPeriod(memberId, metric, YearMonth.now().toString())
                .map(UsageCounter::getUsed)
                .orElse(0);
    }

    private static Integer limitFor(PlanLimits limits, UsageMetric metric) {
        return switch (metric) {
            case OMR_PAGES -> limits.omrPagesPerMonth();
        };
    }

    /** Gói liền trên theo thứ tự sắp xếp; null nếu đã là gói cao nhất. */
    private String upgradeTo(Plan current) {
        return planRepository.findAllByOrderBySortOrderAsc().stream()
                .filter(p -> p.getSortOrder() > current.getSortOrder())
                .findFirst()
                .map(Plan::getCode)
                .orElse(null);
    }
}
