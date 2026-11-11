package com.ptit.music_be.service.billing.impl;

import java.time.LocalDateTime;
import java.time.Period;
import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.NotificationType;
import com.ptit.music_be.dto.enums.SubscriptionSource;
import com.ptit.music_be.dto.enums.SubscriptionStatus;
import com.ptit.music_be.dto.enums.UsageMetric;
import com.ptit.music_be.dto.response.BulkGrantResult;
import com.ptit.music_be.dto.response.MemberPlanSummary;
import com.ptit.music_be.dto.response.MySubscriptionResponse;
import com.ptit.music_be.dto.response.PlanResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.entity.RolePlanSuspension;
import com.ptit.music_be.entity.Subscription;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PlanRepository;
import com.ptit.music_be.repository.RolePlanSuspensionRepository;
import com.ptit.music_be.repository.SubscriptionRepository;
import com.ptit.music_be.repository.UsageCounterRepository;
import com.ptit.music_be.service.billing.PlanLimitsParser;
import com.ptit.music_be.service.billing.SubscriptionService;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class SubscriptionServiceImpl implements SubscriptionService {

    public static final String FREE = "FREE";
    public static final String PRO = "PRO";
    /** Mã gói ảo của SUPER_ADMIN (không lưu trong bảng plans). */
    public static final String UNLIMITED = "UNLIMITED";
    static final String ROLE_SUPER_ADMIN = "SUPER_ADMIN";
    static final String ROLE_ADMIN = "ADMIN";
    static final int MAX_GRANT_MONTHS = 120;
    static final int MAX_BULK_GRANT = 200;
    /** Số ngày còn lại để nhắc, từ xa tới gần. */
    static final int[] REMIND_DAYS = {7, 1};

    PlanRepository planRepository;
    SubscriptionRepository subscriptionRepository;
    UsageCounterRepository usageCounterRepository;
    MemberRepository memberRepository;
    PlanLimitsParser limitsParser;
    NotificationService notificationService;
    RolePlanSuspensionRepository suspensionRepository;

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
        return subscriptionOf(member);
    }

    @Override
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public MySubscriptionResponse ofMember(String memberId) {
        Member member =
                memberRepository.findById(memberId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        return subscriptionOf(member);
    }

    private MySubscriptionResponse subscriptionOf(Member member) {
        int used = usageCounterRepository
                .findByMemberIdAndMetricAndPeriod(
                        member.getId(), UsageMetric.OMR_PAGES, java.time.YearMonth.now().toString())
                .map(u -> u.getUsed())
                .orElse(0);
        String grant = roleGrant(member.getId());
        if (ROLE_SUPER_ADMIN.equals(grant)) {
            return MySubscriptionResponse.builder()
                    .plan(toPlanResponse(unlimitedPlan()))
                    .status("UNLIMITED")
                    .source("ROLE")
                    .roleGrant(grant)
                    .omrPagesUsed(used)
                    .build();
        }
        Subscription current =
                subscriptionRepository.findCurrentOne(member.getId(), LocalDateTime.now()).orElse(null);
        LocalDateTime suspendedUntil = ROLE_ADMIN.equals(grant) ? suspendedUntil(member.getId()) : null;
        Plan pro = ROLE_ADMIN.equals(grant) && suspendedUntil == null
                ? planRepository.findByCode(PRO).orElse(null)
                : null;
        if (pro != null && (current == null || current.getPlan().getSortOrder() < pro.getSortOrder())) {
            // ADMIN chưa mua gói nào cao hơn Pro: dùng Pro theo vai trò, không hết hạn
            return MySubscriptionResponse.builder()
                    .plan(toPlanResponse(pro))
                    .status("ACTIVE")
                    .source("ROLE")
                    .roleGrant(grant)
                    .omrPagesUsed(used)
                    .build();
        }
        MySubscriptionResponse response = toMine(current, current == null ? freePlan() : current.getPlan(), used);
        response.setRoleGrant(grant);
        response.setRolePlanSuspendedUntil(suspendedUntil);
        return response;
    }

    @Override
    @Transactional(readOnly = true)
    public Plan currentPlan(String memberId) {
        String grant = roleGrant(memberId);
        if (ROLE_SUPER_ADMIN.equals(grant)) {
            return unlimitedPlan();
        }
        Plan paid = subscriptionRepository
                .findCurrentOne(memberId, LocalDateTime.now())
                .map(Subscription::getPlan)
                .orElse(null);
        if (ROLE_ADMIN.equals(grant) && suspendedUntil(memberId) == null) {
            Plan pro = planRepository.findByCode(PRO).orElse(null);
            if (pro != null && (paid == null || paid.getSortOrder() < pro.getSortOrder())) {
                return pro;
            }
        }
        return paid != null ? paid : freePlan();
    }

    @Override
    @Transactional(readOnly = true)
    public java.util.Map<String, MemberPlanSummary> plansOf(java.util.Map<String, java.util.Set<String>> rolesByMember) {
        java.util.Map<String, MemberPlanSummary> result = new java.util.HashMap<>();
        if (rolesByMember.isEmpty()) {
            return result;
        }
        LocalDateTime now = LocalDateTime.now();
        // Gói còn hạn mới nhất của mỗi người (một truy vấn cho cả trang)
        java.util.Map<String, Subscription> paid = new java.util.HashMap<>();
        for (Subscription s : subscriptionRepository.findCurrentOfMembers(rolesByMember.keySet(), now)) {
            paid.merge(s.getMember().getId(), s, (a, b) -> a.getExpiresAt().isAfter(b.getExpiresAt()) ? a : b);
        }
        java.util.Map<String, LocalDateTime> suspended = new java.util.HashMap<>();
        for (RolePlanSuspension s : suspensionRepository.findActiveOfMembers(rolesByMember.keySet(), now)) {
            suspended.merge(s.getMemberId(), s.getEndsAt(), (a, b) -> a.isAfter(b) ? a : b);
        }
        Plan free = null;
        Plan pro = null;
        for (var entry : rolesByMember.entrySet()) {
            java.util.Set<String> roles = entry.getValue() == null ? java.util.Set.of() : entry.getValue();
            Subscription sub = paid.get(entry.getKey());
            MemberPlanSummary summary;
            LocalDateTime until = roles.contains(ROLE_ADMIN) && !roles.contains(ROLE_SUPER_ADMIN)
                    ? suspended.get(entry.getKey())
                    : null;
            if (roles.contains(ROLE_SUPER_ADMIN)) {
                summary = new MemberPlanSummary(UNLIMITED, "Unlimited", "UNLIMITED", "ROLE", null, null);
            } else {
                if (roles.contains(ROLE_ADMIN) && pro == null) {
                    pro = planRepository.findByCode(PRO).orElse(null);
                }
                boolean adminPro = roles.contains(ROLE_ADMIN)
                        && until == null
                        && pro != null
                        && (sub == null || sub.getPlan().getSortOrder() < pro.getSortOrder());
                if (adminPro) {
                    summary = new MemberPlanSummary(pro.getCode(), pro.getName(), "ACTIVE", "ROLE", null, null);
                } else if (sub != null) {
                    summary = new MemberPlanSummary(
                            sub.getPlan().getCode(),
                            sub.getPlan().getName(),
                            "ACTIVE",
                            sub.getSource().name(),
                            sub.getExpiresAt(),
                            until);
                } else {
                    if (free == null) {
                        free = freePlan();
                    }
                    summary = new MemberPlanSummary(free.getCode(), free.getName(), "FREE", null, null, until);
                }
            }
            result.put(entry.getKey(), summary);
        }
        return result;
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public MySubscriptionResponse suspendRolePlan(String memberId, int months, String reason) {
        Member member = requirePlainAdmin(memberId);
        String note = reason == null || reason.isBlank() ? null : reason.trim();
        if (months < 0 || months > MAX_GRANT_MONTHS || (note != null && note.length() > 255)) {
            throw new AppException(ErrorCode.ROLE_PLAN_SUSPENSION_INVALID);
        }
        LocalDateTime now = LocalDateTime.now();
        // 0 = đến hết tháng này (00:00 ngày 1 tháng sau); còn lại cộng tháng theo lịch từ bây giờ
        LocalDateTime endsAt = months == 0
                ? now.toLocalDate().withDayOfMonth(1).plusMonths(1).atStartOfDay()
                : now.plusMonths(months);
        // Đang bị ngưng thì thay bằng thời hạn mới để chỉ còn một lần ngưng hiệu lực
        liftActive(memberId, now);
        suspensionRepository.save(RolePlanSuspension.builder()
                .memberId(memberId)
                .startsAt(now)
                .endsAt(endsAt)
                .reason(note)
                .createdBy(memberRepository
                        .findByEmail(SecurityUtils.getCurrentEmail())
                        .map(Member::getId)
                        .orElse(null))
                .build());
        return subscriptionOf(member);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public MySubscriptionResponse liftRolePlanSuspension(String memberId) {
        Member member = requirePlainAdmin(memberId);
        liftActive(memberId, LocalDateTime.now());
        return subscriptionOf(member);
    }

    private Member requirePlainAdmin(String memberId) {
        Member member =
                memberRepository.findById(memberId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        if (!ROLE_ADMIN.equals(roleGrant(memberId))) {
            throw new AppException(ErrorCode.ROLE_PLAN_NOT_APPLICABLE);
        }
        return member;
    }

    private void liftActive(String memberId, LocalDateTime now) {
        for (RolePlanSuspension s : suspensionRepository.findActive(memberId, now)) {
            s.setLiftedAt(now);
            suspensionRepository.save(s);
        }
    }

    /** Thời điểm hết tạm ngưng gói Pro theo vai trò của người này; null nếu không bị ngưng. */
    private LocalDateTime suspendedUntil(String memberId) {
        return suspensionRepository.findActive(memberId, LocalDateTime.now()).stream()
                .map(RolePlanSuspension::getEndsAt)
                .findFirst()
                .orElse(null);
    }

    /** SUPER_ADMIN, ADMIN hoặc null (người dùng thường) theo vai trò lưu trong DB. */
    private String roleGrant(String memberId) {
        if (memberId == null) {
            return null;
        }
        List<String> roles = memberRepository.roleNamesOf(memberId);
        if (roles == null) {
            return null;
        }
        if (roles.contains(ROLE_SUPER_ADMIN)) {
            return ROLE_SUPER_ADMIN;
        }
        return roles.contains(ROLE_ADMIN) ? ROLE_ADMIN : null;
    }

    /** Gói ảo của SUPER_ADMIN: thiếu mọi khóa số = không giới hạn, bật mọi quyền lợi. Không lưu DB. */
    static Plan unlimitedPlan() {
        return Plan.builder()
                .code(UNLIMITED)
                .name("Unlimited")
                .audience(UNLIMITED)
                .priceMonth(0)
                .priceYear(0)
                .limits("{\"collab\":true,\"team\":true,\"omrPriority\":true}")
                .sortOrder(Integer.MAX_VALUE)
                .build();
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
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public MySubscriptionResponse grant(String memberId, String planCode, int months) {
        if (months < 1 || months > MAX_GRANT_MONTHS) {
            throw new AppException(ErrorCode.SUBSCRIPTION_MONTHS_INVALID);
        }
        Member member =
                memberRepository.findById(memberId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        Plan plan = planRepository.findByCode(planCode).orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
        // Gói team cần có team thật (mục 4.1) nên tạm thời chỉ cấp gói cá nhân
        if (!Plan.PERSONAL.equals(plan.getAudience())) {
            throw new AppException(ErrorCode.PLAN_NOT_GRANTABLE);
        }
        // SUPER_ADMIN đã không giới hạn, cấp gói cũng không đổi gì
        if (ROLE_SUPER_ADMIN.equals(roleGrant(memberId))) {
            throw new AppException(ErrorCode.PAYMENT_NOT_NEEDED);
        }
        if (FREE.equals(plan.getCode())) {
            // Cấp Free = bỏ gói đang có
            cancel(memberId);
            return toMine(null, plan, 0);
        }
        activate(member, plan, Period.ofMonths(months), SubscriptionSource.ADMIN_GRANT);
        Subscription current =
                subscriptionRepository.findCurrentOne(memberId, LocalDateTime.now()).orElseThrow();
        return toMine(current, plan, 0);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public java.util.List<BulkGrantResult> grantMany(java.util.List<String> memberIds, String planCode, int months) {
        if (memberIds == null || memberIds.isEmpty() || memberIds.size() > MAX_BULK_GRANT) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        if (months < 1 || months > MAX_GRANT_MONTHS) {
            throw new AppException(ErrorCode.SUBSCRIPTION_MONTHS_INVALID);
        }
        Plan plan = planRepository.findByCode(planCode).orElseThrow(() -> new AppException(ErrorCode.PLAN_NOT_EXISTED));
        if (!Plan.PERSONAL.equals(plan.getAudience()) || FREE.equals(plan.getCode())) {
            throw new AppException(ErrorCode.PLAN_NOT_GRANTABLE);
        }
        Period duration = Period.ofMonths(months);
        java.util.List<BulkGrantResult> results = new java.util.ArrayList<>();
        for (String memberId : new java.util.LinkedHashSet<>(memberIds)) {
            results.add(grantOne(memberId, plan, duration));
        }
        return results;
    }

    /** Cấp cho một người trong lần cấp hàng loạt; không ném lỗi để một người lỗi không làm hỏng cả lần cấp. */
    private BulkGrantResult grantOne(String memberId, Plan plan, Period duration) {
        Member member = memberRepository.findById(memberId).orElse(null);
        if (member == null) {
            return new BulkGrantResult(memberId, "FAILED", ErrorCode.USER_NOT_EXISTED.name(), null);
        }
        String grant = roleGrant(memberId);
        if (ROLE_SUPER_ADMIN.equals(grant)) {
            return new BulkGrantResult(memberId, "SKIPPED", ErrorCode.PAYMENT_NOT_NEEDED.name(), null);
        }
        LocalDateTime now = LocalDateTime.now();
        Subscription current = subscriptionRepository.findCurrentOne(memberId, now).orElse(null);
        if (ROLE_ADMIN.equals(grant) && PRO.equals(plan.getCode()) && suspendedUntil(memberId) == null
                && current == null) {
            // ADMIN đang có Pro không thời hạn: cấp Pro không thêm gì
            return new BulkGrantResult(memberId, "SKIPPED", ErrorCode.PAYMENT_NOT_NEEDED.name(), null);
        }
        boolean renew = current != null && current.getPlan().getId().equals(plan.getId());
        activate(member, plan, duration, SubscriptionSource.ADMIN_GRANT);
        LocalDateTime expiresAt = subscriptionRepository
                .findCurrentOne(memberId, now)
                .map(Subscription::getExpiresAt)
                .orElse(null);
        return new BulkGrantResult(memberId, renew ? "RENEWED" : "GRANTED", null, expiresAt);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('SUPER_ADMIN')")
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

    @Override
    @Transactional
    public int remindExpiring() {
        LocalDateTime now = LocalDateTime.now();
        int sent = 0;
        for (int days : REMIND_DAYS) {
            List<Subscription> expiring = subscriptionRepository
                    .findByStatusAndExpiresAtGreaterThanAndExpiresAtLessThanEqual(
                            SubscriptionStatus.ACTIVE, now.plusDays(days - 1L), now.plusDays(days));
            for (Subscription s : expiring) {
                String date = s.getExpiresAt().format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"));
                notificationService.notify(
                        s.getMember(),
                        null,
                        NotificationType.PLAN_EXPIRING,
                        null,
                        "Gói " + s.getPlan().getName() + " sẽ hết hạn sau " + days + " ngày (" + date
                                + "). Hãy mua lại để không bị gián đoạn.",
                        NotificationService.params(
                                "plan", s.getPlan().getName(), "days", String.valueOf(days), "date", date));
                sent++;
            }
        }
        return sent;
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
                .audience(plan.getAudience())
                .priceMonth(plan.getPriceMonth())
                .priceYear(plan.getPriceYear())
                .limits(limitsParser.parse(plan))
                .sortOrder(plan.getSortOrder())
                .build();
    }
}
