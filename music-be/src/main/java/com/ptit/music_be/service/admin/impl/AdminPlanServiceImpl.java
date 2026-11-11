package com.ptit.music_be.service.admin.impl;

import java.util.List;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.request.UpdatePlanRequest;
import com.ptit.music_be.dto.response.PlanResponse;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.service.admin.AdminPlanService;
import com.ptit.music_be.service.billing.PlanLimits;
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
    /** Trần cho mỗi hạn mức dạng số (muốn bỏ giới hạn thì để null). */
    static final int MAX_LIMIT = 10_000_000;

    static final int MAX_NAME_LENGTH = 100;

    PlanRepository planRepository;
    SubscriptionService subscriptionService;
    ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public List<PlanResponse> list() {
        return subscriptionService.listPlans();
    }

    @Override
    @Transactional
    public PlanResponse update(String code, UpdatePlanRequest request) {
        if (!SecurityUtils.isSuperAdmin()) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        Plan plan = planRepository.findByCode(code).orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
        if (request == null) {
            throw new AppException(ErrorCode.PLAN_PRICE_INVALID);
        }
        String name = request.getName() == null ? "" : request.getName().trim();
        if (name.isEmpty() || name.length() > MAX_NAME_LENGTH) {
            throw new AppException(ErrorCode.PLAN_NAME_INVALID);
        }
        Long month = request.getPriceMonth();
        Long year = request.getPriceYear();
        boolean free = SubscriptionServiceImpl.FREE.equals(plan.getCode());
        if (month == null || year == null || !validPrice(month, free) || !validPrice(year, free)) {
            throw new AppException(ErrorCode.PLAN_PRICE_INVALID);
        }
        PlanLimits limits = request.getLimits();
        if (limits == null || !validLimits(limits)) {
            throw new AppException(ErrorCode.PLAN_LIMITS_INVALID);
        }
        String limitsJson = toJson(limits);
        log.info(
                "{} sửa gói {}: tên \"{}\" -> \"{}\", giá tháng {} -> {}, giá năm {} -> {}, hạn mức {} -> {}",
                SecurityUtils.getCurrentEmail(),
                plan.getCode(),
                plan.getName(),
                name,
                plan.getPriceMonth(),
                month,
                plan.getPriceYear(),
                year,
                plan.getLimits(),
                limitsJson);
        plan.setName(name);
        plan.setPriceMonth(month);
        plan.setPriceYear(year);
        plan.setLimits(limitsJson);
        planRepository.save(plan);
        return subscriptionService.listPlans().stream()
                .filter(p -> p.getCode().equals(plan.getCode()))
                .findFirst()
                .orElseThrow();
    }

    /** Gói FREE luôn 0; gói trả phí trong khoảng (0, MAX_PRICE]. */
    private static boolean validPrice(long price, boolean free) {
        return free ? price == 0 : price > 0 && price <= MAX_PRICE;
    }

    /** Mỗi hạn mức số: null (không giới hạn) hoặc 0..MAX_LIMIT; số task cùng lúc ít nhất 1 để vẫn số hóa được. */
    private static boolean validLimits(PlanLimits l) {
        boolean inRange = Stream.of(l.omrPagesPerMonth(), l.storageMb(), l.keptVersions(), l.exportsPerMonth())
                .allMatch(v -> v == null || (v >= 0 && v <= MAX_LIMIT));
        Integer concurrent = l.omrConcurrent();
        return inRange && (concurrent == null || (concurrent >= 1 && concurrent <= MAX_LIMIT));
    }

    /** Ghi đủ mọi khóa (kể cả null = không giới hạn) và cờ false thay cho null. */
    private String toJson(PlanLimits l) {
        PlanLimits normalized = new PlanLimits(
                l.omrPagesPerMonth(),
                l.omrConcurrent(),
                l.storageMb(),
                l.keptVersions(),
                l.exportsPerMonth(),
                Boolean.TRUE.equals(l.collab()),
                Boolean.TRUE.equals(l.team()),
                Boolean.TRUE.equals(l.omrPriority()));
        try {
            return objectMapper.writeValueAsString(normalized);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Không ghi được hạn mức gói", e);
        }
    }
}
