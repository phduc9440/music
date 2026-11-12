package com.ptit.music_be.service.admin.impl;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ptit.music_be.dto.request.admin.CreatePlanRequest;
import com.ptit.music_be.dto.request.admin.UpdatePlanRequest;
import com.ptit.music_be.dto.response.billing.PlanResponse;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.billing.PaymentOrderRepository;
import com.ptit.music_be.repository.billing.PlanRepository;
import com.ptit.music_be.repository.billing.SubscriptionRepository;
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
    static final int MAX_SORT_ORDER = 10_000;
    static final Pattern CODE = Pattern.compile("^[A-Z0-9_]{2,16}$");
    /** Gói mà code dựa vào: FREE cho người chưa mua, PRO cho quản trị viên; UNLIMITED là mã gói ảo của SUPER_ADMIN. */
    static final Set<String> SYSTEM_CODES =
            Set.of(SubscriptionServiceImpl.FREE, SubscriptionServiceImpl.PRO, SubscriptionServiceImpl.UNLIMITED);

    PlanRepository planRepository;
    SubscriptionRepository subscriptionRepository;
    PaymentOrderRepository paymentOrderRepository;
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
        requireSuperAdmin();
        Plan plan = planRepository.findByCode(code).orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
        if (request == null) {
            throw new AppException(ErrorCode.PLAN_PRICE_INVALID);
        }
        Fields f = validate(plan.getCode(), request.getName(), request.getPriceMonth(), request.getPriceYear(),
                request.getLimits(), request.getSortOrder());
        log.info(
                "{} sửa gói {}: tên \"{}\" -> \"{}\", giá tháng {} -> {}, giá năm {} -> {}, hạn mức {} -> {}",
                SecurityUtils.getCurrentEmail(),
                plan.getCode(),
                plan.getName(),
                f.name(),
                plan.getPriceMonth(),
                f.priceMonth(),
                plan.getPriceYear(),
                f.priceYear(),
                plan.getLimits(),
                f.limitsJson());
        plan.setName(f.name());
        plan.setPriceMonth(f.priceMonth());
        plan.setPriceYear(f.priceYear());
        plan.setLimits(f.limitsJson());
        if (f.sortOrder() != null) {
            plan.setSortOrder(f.sortOrder());
        }
        planRepository.save(plan);
        return responseOf(plan.getCode());
    }

    @Override
    @Transactional
    public PlanResponse create(CreatePlanRequest request) {
        requireSuperAdmin();
        if (request == null) {
            throw new AppException(ErrorCode.PLAN_CODE_INVALID);
        }
        String code = request.getCode() == null ? "" : request.getCode().trim().toUpperCase();
        if (!CODE.matcher(code).matches() || SubscriptionServiceImpl.UNLIMITED.equals(code)) {
            throw new AppException(ErrorCode.PLAN_CODE_INVALID);
        }
        if (planRepository.findByCode(code).isPresent()) {
            throw new AppException(ErrorCode.PLAN_CODE_EXISTED);
        }
        String audience = request.getAudience() == null ? "" : request.getAudience().trim().toUpperCase();
        if (!Plan.PERSONAL.equals(audience) && !Plan.TEAM.equals(audience)) {
            throw new AppException(ErrorCode.PLAN_AUDIENCE_INVALID);
        }
        Fields f = validate(code, request.getName(), request.getPriceMonth(), request.getPriceYear(),
                request.getLimits(), request.getSortOrder());
        int sortOrder = f.sortOrder() != null
                ? f.sortOrder()
                : planRepository.findAllByOrderBySortOrderAsc().stream()
                                .mapToInt(Plan::getSortOrder)
                                .max()
                                .orElse(0)
                        + 1;
        planRepository.save(Plan.builder()
                .code(code)
                .name(f.name())
                .audience(audience)
                .priceMonth(f.priceMonth())
                .priceYear(f.priceYear())
                .limits(f.limitsJson())
                .sortOrder(sortOrder)
                .build());
        log.info("{} tạo gói {} ({}): {}", SecurityUtils.getCurrentEmail(), code, audience, f.limitsJson());
        return responseOf(code);
    }

    @Override
    @Transactional
    public void delete(String code) {
        requireSuperAdmin();
        Plan plan = planRepository.findByCode(code).orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
        if (SYSTEM_CODES.contains(plan.getCode())) {
            throw new AppException(ErrorCode.PLAN_SYSTEM_LOCKED);
        }
        // Còn người đăng ký (kể cả đã hết hạn) hoặc đơn thanh toán thì giữ lại để không mất lịch sử doanh thu
        if (subscriptionRepository.existsByPlanId(plan.getId()) || paymentOrderRepository.existsByPlanId(plan.getId())) {
            throw new AppException(ErrorCode.PLAN_IN_USE);
        }
        planRepository.delete(plan);
        log.info("{} xóa gói {}", SecurityUtils.getCurrentEmail(), plan.getCode());
    }

    private static void requireSuperAdmin() {
        if (!SecurityUtils.isSuperAdmin()) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
    }

    private PlanResponse responseOf(String code) {
        return subscriptionService.listPlans().stream()
                .filter(p -> p.getCode().equals(code))
                .findFirst()
                .orElseThrow();
    }

    /** Dữ liệu đã kiểm tra, dùng chung cho tạo và sửa. */
    private record Fields(String name, long priceMonth, long priceYear, String limitsJson, Integer sortOrder) {}

    private Fields validate(
            String code, String rawName, Long month, Long year, PlanLimits limits, Integer sortOrder) {
        String name = rawName == null ? "" : rawName.trim();
        if (name.isEmpty() || name.length() > MAX_NAME_LENGTH) {
            throw new AppException(ErrorCode.PLAN_NAME_INVALID);
        }
        boolean free = SubscriptionServiceImpl.FREE.equals(code);
        if (month == null || year == null || !validPrice(month, free) || !validPrice(year, free)) {
            throw new AppException(ErrorCode.PLAN_PRICE_INVALID);
        }
        if (limits == null || !validLimits(limits)) {
            throw new AppException(ErrorCode.PLAN_LIMITS_INVALID);
        }
        if (sortOrder != null && (sortOrder < 0 || sortOrder > MAX_SORT_ORDER)) {
            throw new AppException(ErrorCode.PLAN_LIMITS_INVALID);
        }
        return new Fields(name, month, year, toJson(limits), sortOrder);
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
        Integer teamMembers = l.teamMembers();
        // Team ít nhất 2 người (chủ team và một người nữa) thì mới có nghĩa
        return inRange
                && (concurrent == null || (concurrent >= 1 && concurrent <= MAX_LIMIT))
                && (teamMembers == null || (teamMembers >= 2 && teamMembers <= MAX_LIMIT));
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
                Boolean.TRUE.equals(l.omrPriority()),
                Boolean.TRUE.equals(l.team()) ? l.teamMembers() : null);
        try {
            return objectMapper.writeValueAsString(normalized);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Không ghi được hạn mức gói", e);
        }
    }
}
