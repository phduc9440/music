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
    static final int MAX_GRANT_DAYS = 3650;
    /** Số ngày còn lại để nhắc, từ xa tới gần. */
    static final int[] REMIND_DAYS = {7, 1};

    PlanRepository planRepository;
    SubscriptionRepository subscriptionRepository;
    UsageCounterRepository usageCounterRepository;
    MemberRepository memberRepository;
    PlanLimitsParser limitsParser;
    NotificationService notificationService;

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
        Plan pro = ROLE_ADMIN.equals(grant) ? planRepository.findByCode(PRO).orElse(null) : null;
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
        if (ROLE_ADMIN.equals(grant)) {
            Plan pro = planRepository.findByCode(PRO).orElse(null);
            if (pro != null && (paid == null || paid.getSortOrder() < pro.getSortOrder())) {
                return pro;
            }
        }
        return paid != null ? paid : freePlan();
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
                .build();
    }
}
