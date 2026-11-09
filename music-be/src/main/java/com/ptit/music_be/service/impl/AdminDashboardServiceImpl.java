package com.ptit.music_be.service.impl;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.response.AdminDashboardResponse;
import com.ptit.music_be.dto.response.AdminDashboardResponse.DayCount;
import com.ptit.music_be.dto.response.AdminDashboardResponse.DayPractice;
import com.ptit.music_be.dto.response.AdminDashboardResponse.KeyCount;
import com.ptit.music_be.dto.response.AdminDashboardResponse.Totals;
import com.ptit.music_be.dto.response.AdminDashboardResponse.TopScore;
import com.ptit.music_be.service.AdminDashboardService;

import lombok.extern.slf4j.Slf4j;

/** Gom số liệu bằng các câu JPQL đếm/nhóm; chỉ đọc nên dùng EntityManager thay vì thêm hàng loạt repository. */
@Service
@Slf4j
@PreAuthorize("hasRole('ADMIN')")
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

        return AdminDashboardResponse.builder()
                .days(safeDays)
                .totals(totals())
                .scoresByDay(scoresByDay(start, today))
                .membersByDay(membersByDay(start, today))
                .membersWithoutDate(count("select count(m) from Member m where m.createdAt is null"))
                .practiceByDay(practiceByDay(start, today))
                .scoresByVisibility(keyCounts("select coalesce(s.visibility, 'PRIVATE'), count(s) from Score s group by s.visibility"))
                .scoresBySource(keyCounts("select coalesce(s.sourceType, 'UNKNOWN'), count(s) from Score s group by s.sourceType"))
                .scoresByDifficulty(keyCounts(
                        "select coalesce(cast(s.difficulty as string), 'NONE'), count(s) from Score s group by s.difficulty"))
                .aiTasksByStatus(keyCounts("select cast(t.status as string), count(t) from AiTask t group by t.status"))
                .topTags(topTags())
                .topViewed(topViewed())
                .build();
    }

    private Totals totals() {
        Double avg = em.createQuery("select avg(r.rating) from ScoreReview r where r.rating is not null", Double.class)
                .getSingleResult();
        return Totals.builder()
                .members(count("select count(m) from Member m"))
                .activeMembers(countWithStatus(MemberStatus.ACTIVE))
                .lockedMembers(countWithStatus(MemberStatus.INACTIVE))
                .admins(count(
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
        List<Object[]> rows = em.createQuery(
                        "select cast(s.createdAt as date), count(s) from Score s"
                                + " where s.createdAt >= :from and s.createdAt < :to group by cast(s.createdAt as date)",
                        Object[].class)
                .setParameter("from", start.atStartOfDay())
                .setParameter("to", end.plusDays(1).atStartOfDay())
                .getResultList();
        Map<LocalDate, Long> byDay = new HashMap<>();
        for (Object[] r : rows) {
            byDay.put(LocalDate.parse(r[0].toString()), ((Number) r[1]).longValue());
        }
        List<DayCount> result = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            result.add(new DayCount(d, byDay.getOrDefault(d, 0L)));
        }
        return result;
    }

    private List<DayCount> membersByDay(LocalDate start, LocalDate end) {
        List<Object[]> rows = em.createQuery(
                        "select cast(m.createdAt as date), count(m) from Member m"
                                + " where m.createdAt >= :from and m.createdAt < :to group by cast(m.createdAt as date)",
                        Object[].class)
                .setParameter("from", start.atStartOfDay())
                .setParameter("to", end.plusDays(1).atStartOfDay())
                .getResultList();
        Map<LocalDate, Long> byDay = new HashMap<>();
        for (Object[] r : rows) {
            byDay.put(LocalDate.parse(r[0].toString()), ((Number) r[1]).longValue());
        }
        List<DayCount> result = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            result.add(new DayCount(d, byDay.getOrDefault(d, 0L)));
        }
        return result;
    }

    private List<DayPractice> practiceByDay(LocalDate start, LocalDate end) {
        List<Object[]> rows = em.createQuery(
                        "select cast(p.startedAt as date), count(p), coalesce(sum(p.durationSeconds), 0)"
                                + " from PracticeSession p where p.startedAt >= :from and p.startedAt < :to"
                                + " group by cast(p.startedAt as date)",
                        Object[].class)
                .setParameter("from", start.atStartOfDay())
                .setParameter("to", end.plusDays(1).atStartOfDay())
                .getResultList();
        Map<LocalDate, Object[]> byDay = new HashMap<>();
        for (Object[] r : rows) {
            byDay.put(LocalDate.parse(r[0].toString()), r);
        }
        List<DayPractice> result = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            Object[] r = byDay.get(d);
            long sessions = r == null ? 0 : ((Number) r[1]).longValue();
            double minutes = r == null ? 0 : Math.round(((Number) r[2]).doubleValue() / 6.0) / 10.0;
            result.add(new DayPractice(d, sessions, minutes));
        }
        return result;
    }

    private List<KeyCount> keyCounts(String jpql) {
        return em.createQuery(jpql, Object[].class).getResultList().stream()
                .map(r -> new KeyCount(String.valueOf(r[0]), ((Number) r[1]).longValue()))
                .toList();
    }

    private List<KeyCount> topTags() {
        return em.createQuery(
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
        return em.createQuery(
                        "select s.id, s.title, s.member.email, coalesce(s.viewCount, 0) from Score s"
                                + " where coalesce(s.viewCount, 0) > 0 order by s.viewCount desc, s.title",
                        Object[].class)
                .setMaxResults(TOP_SCORES)
                .getResultList()
                .stream()
                .map(r -> new TopScore(
                        (String) r[0], (String) r[1], (String) r[2], ((Number) r[3]).longValue()))
                .toList();
    }
}
