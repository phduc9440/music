package com.ptit.music_be.service.admin.impl;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.dto.enums.billing.PaymentStatus;
import com.ptit.music_be.dto.enums.billing.SubscriptionStatus;
import com.ptit.music_be.dto.response.admin.AdminDashboardResponse;
import com.ptit.music_be.dto.response.admin.AdminDashboardResponse.Billing;
import com.ptit.music_be.dto.response.admin.AdminDashboardResponse.DayCount;
import com.ptit.music_be.dto.response.admin.AdminDashboardResponse.DayPractice;
import com.ptit.music_be.dto.response.admin.AdminDashboardResponse.DayRevenue;
import com.ptit.music_be.dto.response.admin.AdminDashboardResponse.KeyCount;
import com.ptit.music_be.dto.response.admin.AdminDashboardResponse.TopScore;
import com.ptit.music_be.dto.response.admin.AdminDashboardResponse.Totals;
import com.ptit.music_be.entity.PlanSanction;
import com.ptit.music_be.service.admin.AdminDashboardService;

import lombok.extern.slf4j.Slf4j;

/** Gom số liệu bằng các câu JPQL đếm/nhóm; chỉ đọc nên dùng EntityManager thay vì thêm hàng loạt repository. */
@Service
@Slf4j
@PreAuthorize("@perm.has('DASHBOARD_VIEW')")
public class AdminDashboardServiceImpl implements AdminDashboardService {

    static final int DEFAULT_DAYS = 30;
    static final int MIN_DAYS = 7;
    static final int MAX_DAYS = 90;
    static final int TOP_LIMIT = 8;
    static final int TOP_SCORES = 5;

    @PersistenceContext
    EntityManager em;

    @Override
    @Transactional(readOnly = true)
    public AdminDashboardResponse getDashboard(int days) {
        int safeDays = days <= 0 ? DEFAULT_DAYS : Math.max(MIN_DAYS, Math.min(days, MAX_DAYS));
        LocalDate today = LocalDate.now();
        LocalDate start = today.minusDays(safeDays - 1L);
        LocalDateTime now = LocalDateTime.now();

        return AdminDashboardResponse.builder()
                .days(safeDays)
                .totals(totals())
                .scoresByDay(scoresByDay(start, today))
                .membersByDay(membersByDay(start, today))
                .membersWithoutDate(count("select count(m) from Member m where m.createdAt is null"))
                .practiceByDay(practiceByDay(start, today))
                .scoresByVisibility(keyCounts(
                        "select coalesce(s.visibility, 'PRIVATE'), count(s) from Score s group by s.visibility"))
                .scoresBySource(keyCounts(
                        "select coalesce(s.sourceType, 'UNKNOWN'), count(s) from Score s group by s.sourceType"))
                .scoresByDifficulty(
                        keyCounts(
                                "select coalesce(cast(s.difficulty as string), 'NONE'), count(s) from Score s group by s.difficulty"))
                .aiTasksByStatus(keyCounts("select cast(t.status as string), count(t) from AiTask t group by t.status"))
                .topTags(topTags())
                .topViewed(topViewed())
                .billing(billing(start, today, now))
                .revenueByDay(revenueByDay(start, today))
                .subscriptionsByPlan(keyCounts(em.createQuery(
                                "select s.plan.name, count(s) from Subscription s"
                                        + " where s.status = :status and s.expiresAt > :now"
                                        + " group by s.plan.id, s.plan.name, s.plan.sortOrder"
                                        + " order by s.plan.sortOrder, s.plan.name",
                                Object[].class)
                        .setParameter("status", SubscriptionStatus.ACTIVE)
                        .setParameter("now", now)
                        .getResultList()))
                .subscriptionsBySource(keyCounts(em.createQuery(
                                "select cast(s.source as string), count(s) from Subscription s"
                                        + " where s.status = :status and s.expiresAt > :now group by s.source",
                                Object[].class)
                        .setParameter("status", SubscriptionStatus.ACTIVE)
                        .setParameter("now", now)
                        .getResultList()))
                .build();
    }

    private Totals totals() {
        Double avg = em.createQuery("select avg(r.rating) from ScoreReview r where r.rating is not null", Double.class)
                .getSingleResult();
        return Totals.builder()
                .members(count("select count(m) from Member m"))
                .activeMembers(countWithStatus(MemberStatus.ACTIVE))
                .lockedMembers(countWithStatus(MemberStatus.INACTIVE))
                .admins(
                        count(
                                "select count(distinct mr.member) from MemberRole mr where mr.role.name in ('ADMIN', 'SUPER_ADMIN')"))
                .scores(count("select count(s) from Score s"))
                .publicScores(count("select count(s) from Score s where s.visibility = 'PUBLIC'"))
                .pendingScores(count("select count(s) from Score s where s.visibility = 'PENDING'"))
                .officialScores(count("select count(s) from Score s where s.isOfficial = true"))
                .reviews(count("select count(r) from ScoreReview r"))
                .averageRating(avg == null ? null : Math.round(avg * 10) / 10.0)
                .practiceSessions(count("select count(p) from PracticeSession p"))
                .aiTasksRunning(em.createQuery("select count(t) from AiTask t where t.status in :s", Long.class)
                        .setParameter("s", List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING))
                        .getSingleResult())
                .aiTasksFailed(em.createQuery("select count(t) from AiTask t where t.status = :s", Long.class)
                        .setParameter("s", AiTaskStatus.FAILED)
                        .getSingleResult())
                .build();
    }

    private long countWithStatus(MemberStatus status) {
        return em.createQuery("select count(m) from Member m where m.status = :s", Long.class)
                .setParameter("s", status)
                .getSingleResult();
    }

    private long count(String jpql) {
        return em.createQuery(jpql, Long.class).getSingleResult();
    }

    private List<DayCount> scoresByDay(LocalDate start, LocalDate end) {
        return dayCounts(
                "select cast(s.createdAt as date), count(s) from Score s"
                        + " where s.createdAt >= :from and s.createdAt < :to group by cast(s.createdAt as date)",
                start,
                end);
    }

    private List<DayCount> membersByDay(LocalDate start, LocalDate end) {
        return dayCounts(
                "select cast(m.createdAt as date), count(m) from Member m"
                        + " where m.createdAt >= :from and m.createdAt < :to group by cast(m.createdAt as date)",
                start,
                end);
    }

    /** Chạy câu nhóm theo ngày (cột 0 là ngày, cột 1 là số) và điền 0 cho ngày không có. */
    private List<DayCount> dayCounts(String jpql, LocalDate start, LocalDate end) {
        Map<LocalDate, Object[]> byDay = byDay(em.createQuery(jpql, Object[].class), start, end);
        List<DayCount> result = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            Object[] r = byDay.get(d);
            result.add(new DayCount(d, r == null ? 0 : ((Number) r[1]).longValue()));
        }
        return result;
    }

    /** Gắn khoảng [start, end] vào câu có tham số :from/:to và gom kết quả theo ngày ở cột 0. */
    private Map<LocalDate, Object[]> byDay(TypedQuery<Object[]> query, LocalDate start, LocalDate end) {
        Map<LocalDate, Object[]> byDay = new HashMap<>();
        for (Object[] r : query.setParameter("from", start.atStartOfDay())
                .setParameter("to", end.plusDays(1).atStartOfDay())
                .getResultList()) {
            byDay.put(LocalDate.parse(r[0].toString()), r);
        }
        return byDay;
    }

    private List<DayPractice> practiceByDay(LocalDate start, LocalDate end) {
        Map<LocalDate, Object[]> byDay = byDay(
                em.createQuery(
                        "select cast(p.startedAt as date), count(p), coalesce(sum(p.durationSeconds), 0)"
                                + " from PracticeSession p where p.startedAt >= :from and p.startedAt < :to"
                                + " group by cast(p.startedAt as date)",
                        Object[].class),
                start,
                end);
        List<DayPractice> result = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            Object[] r = byDay.get(d);
            long sessions = r == null ? 0 : ((Number) r[1]).longValue();
            double minutes = r == null ? 0 : Math.round(((Number) r[2]).doubleValue() / 6.0) / 10.0;
            result.add(new DayPractice(d, sessions, minutes));
        }
        return result;
    }

    /** Tổng tiền/số đơn theo trạng thái trong khoảng, gói và đơn đang chờ tính tại thời điểm now. */
    private Billing billing(LocalDate start, LocalDate end, LocalDateTime now) {
        long[] paid = paidSum(PaymentStatus.PAID, start, end);
        long[] refunded = paidSum(PaymentStatus.REFUNDED, start, end);
        return Billing.builder()
                .revenue(paid[0])
                .paidOrders(paid[1])
                .refundedAmount(refunded[0])
                .refundedOrders(refunded[1])
                .activeSubscriptions(em.createQuery(
                                "select count(s) from Subscription s where s.status = :status and s.expiresAt > :now",
                                Long.class)
                        .setParameter("status", SubscriptionStatus.ACTIVE)
                        .setParameter("now", now)
                        .getSingleResult())
                .subscribedMembers(em.createQuery(
                                "select count(distinct s.member) from Subscription s"
                                        + " where s.status = :status and s.expiresAt > :now",
                                Long.class)
                        .setParameter("status", SubscriptionStatus.ACTIVE)
                        .setParameter("now", now)
                        .getSingleResult())
                .pendingOrders(em.createQuery(
                                "select count(o) from PaymentOrder o where o.status = :status and o.expiresAt > :now",
                                Long.class)
                        .setParameter("status", PaymentStatus.PENDING)
                        .setParameter("now", now)
                        .getSingleResult())
                .activeBans(em.createQuery(
                                "select count(s) from PlanSanction s where s.type = :type and s.liftedAt is null"
                                        + " and s.startsAt <= :now and s.endsAt > :now",
                                Long.class)
                        .setParameter("type", PlanSanction.BAN)
                        .setParameter("now", now)
                        .getSingleResult())
                .build();
    }

    /** {tổng tiền, số đơn} của các đơn ở trạng thái status có ngày thanh toán trong [start, end]. */
    private long[] paidSum(PaymentStatus status, LocalDate start, LocalDate end) {
        Object[] r = em.createQuery(
                        "select coalesce(sum(o.amount), 0), count(o) from PaymentOrder o"
                                + " where o.status = :status and o.paidAt >= :from and o.paidAt < :to",
                        Object[].class)
                .setParameter("status", status)
                .setParameter("from", start.atStartOfDay())
                .setParameter("to", end.plusDays(1).atStartOfDay())
                .getSingleResult();
        return new long[] {((Number) r[0]).longValue(), ((Number) r[1]).longValue()};
    }

    private List<DayRevenue> revenueByDay(LocalDate start, LocalDate end) {
        Map<LocalDate, Object[]> byDay = byDay(
                em.createQuery(
                                "select cast(o.paidAt as date), coalesce(sum(o.amount), 0), count(o) from PaymentOrder o"
                                        + " where o.status = :status and o.paidAt >= :from and o.paidAt < :to"
                                        + " group by cast(o.paidAt as date)",
                                Object[].class)
                        .setParameter("status", PaymentStatus.PAID),
                start,
                end);
        List<DayRevenue> result = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            Object[] r = byDay.get(d);
            result.add(
                    r == null
                            ? new DayRevenue(d, 0, 0)
                            : new DayRevenue(d, ((Number) r[1]).longValue(), ((Number) r[2]).longValue()));
        }
        return result;
    }

    private List<KeyCount> keyCounts(String jpql) {
        return keyCounts(em.createQuery(jpql, Object[].class).getResultList());
    }

    private static List<KeyCount> keyCounts(List<Object[]> rows) {
        return rows.stream()
                .map(r -> new KeyCount(String.valueOf(r[0]), ((Number) r[1]).longValue()))
                .toList();
    }

    private List<KeyCount> topTags() {
        return em
                .createQuery(
                        "select st.tag.name, count(st) from ScoreTag st group by st.tag.id, st.tag.name"
                                + " order by count(st) desc, st.tag.name",
                        Object[].class)
                .setMaxResults(TOP_LIMIT)
                .getResultList()
                .stream()
                .map(r -> new KeyCount(String.valueOf(r[0]), ((Number) r[1]).longValue()))
                .toList();
    }

    private List<TopScore> topViewed() {
        return em
                .createQuery(
                        "select s.id, s.title, s.member.email, coalesce(s.viewCount, 0) from Score s"
                                + " where coalesce(s.viewCount, 0) > 0 order by s.viewCount desc, s.title",
                        Object[].class)
                .setMaxResults(TOP_SCORES)
                .getResultList()
                .stream()
                .map(r -> new TopScore((String) r[0], (String) r[1], (String) r[2], ((Number) r[3]).longValue()))
                .toList();
    }
}
