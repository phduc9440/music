package com.ptit.music_be.service.admin.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.request.UpdatePlanPriceRequest;
import com.ptit.music_be.dto.response.PlanResponse;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.service.admin.AdminPlanService;
import com.ptit.music_be.service.billing.SubscriptionService;
import com.ptit.music_be.service.billing.impl.SubscriptionServiceImpl;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AdminPlanServiceImpl implements AdminPlanService {

    /** Trần giá để tránh gõ nhầm thêm số 0 (1 tỷ đồng). */
    static final long MAX_PRICE = 1_000_000_000L;

    PlanRepository planRepository;
    SubscriptionService subscriptionService;

    @Override
    @Transactional(readOnly = true)
    public List<PlanResponse> list() {
        return subscriptionService.listPlans();
    }

    @Override
    @Transactional
    public PlanResponse updatePrice(String code, UpdatePlanPriceRequest request) {
        if (!SecurityUtils.isSuperAdmin()) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        Plan plan = planRepository.findByCode(code).orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
        Long month = request == null ? null : request.getPriceMonth();
        Long year = request == null ? null : request.getPriceYear();
        boolean free = SubscriptionServiceImpl.FREE.equals(plan.getCode());
        if (month == null || year == null || !valid(month, free) || !valid(year, free)) {
            throw new AppException(ErrorCode.PLAN_PRICE_INVALID);
        }
        log.info(
                "{} đổi giá gói {}: tháng {} -> {}, năm {} -> {}",
                SecurityUtils.getCurrentEmail(),
                plan.getCode(),
                plan.getPriceMonth(),
                month,
                plan.getPriceYear(),
                year);
        plan.setPriceMonth(month);
        plan.setPriceYear(year);
        planRepository.save(plan);
        return subscriptionService.listPlans().stream()
                .filter(p -> p.getCode().equals(plan.getCode()))
                .findFirst()
                .orElseThrow();
    }

    /** Gói FREE luôn 0; gói trả phí trong khoảng (0, MAX_PRICE]. */
    private static boolean valid(long price, boolean free) {
        return free ? price == 0 : price > 0 && price <= MAX_PRICE;
    }
}
