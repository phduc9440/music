package com.ptit.music_be.service.admin.impl;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.EntityManager;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.practice.PracticeMode;
import com.ptit.music_be.dto.response.admin.AdminPracticeSessionResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.entity.PracticeSession;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.LibraryErrorCode;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.service.admin.AdminPracticeService;
import com.ptit.music_be.utils.AppTime;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@PreAuthorize("@perm.has('PRACTICE_VIEW')")
public class AdminPracticeServiceImpl implements AdminPracticeService {

    static final int DEFAULT_PAGE_SIZE = 10;
    static final int MAX_PAGE_SIZE = 100;
    static final int DEFAULT_DAYS = 30;
    static final int MAX_DAYS = 400;

    /** Buổi COMPLETED ngắn hơn ngưỡng này (giây) coi là bất thường. */
    static final int SHORT_SECONDS = 10;
    /** Buổi dài hơn ngưỡng này (giây), hoặc IN_PROGRESS quá ngưỡng này, coi là bất thường / treo. */
    static final int LONG_SECONDS = 6 * 3600;

    static final String ANOMALY_CODE_SHORT = "SHORT";
    static final String ANOMALY_CODE_LONG = "LONG";
    static final String ANOMALY_CODE_ZERO = "ZERO_ACCURACY";
    static final String ANOMALY_CODE_STUCK = "STUCK";

    /** Cùng quy tắc với {@link #anomalies}; hai nơi phải khớp nhau. */
    static final String ANOMALY_JPQL = "((p.status = :completed and p.durationSeconds < " + SHORT_SECONDS + ")"
            + " or p.durationSeconds > " + LONG_SECONDS
            + " or (p.status = :completed and p.totalNotes > 0 and coalesce(p.accuracyPct, 0) = 0)"
            + " or (p.status = :inProgress and p.startedAt < :stuckBefore))";

    EntityManager entityManager;
    PracticeSessionRepository practiceSessionRepository;

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AdminPracticeSessionResponse> list(
            int page,
            int size,
            String keyword,
            String mode,
            String status,
            boolean anomalousOnly,
            LocalDate from,
            LocalDate to) {
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        PracticeMode modeFilter = parseMode(mode);
        PracticeSessionStatus statusFilter = parseStatus(status);
        String kw = keyword == null ? "" : keyword.trim().toLowerCase();
        if (kw.length() > 100) {
            throw new AppException(AccountErrorCode.INVALID_REQUEST);
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

        StringBuilder where = new StringBuilder(" where 1 = 1");
        Map<String, Object> params = new HashMap<>();
        if (modeFilter != null) {
            where.append(" and p.mode = :mode");
            params.put("mode", modeFilter);
        }
        if (statusFilter != null) {
            where.append(" and p.status = :status");
            params.put("status", statusFilter);
        }
        if (!kw.isEmpty()) {
            where.append(" and (lower(m.email) like :kw or lower(coalesce(m.fullName, '')) like :kw"
                    + " or lower(coalesce(s.title, '')) like :kw)");
            params.put("kw", "%" + kw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (from != null) {
            where.append(" and p.startedAt >= :from");
            params.put("from", AppTime.startOfDayUtc(from));
        }
        if (to != null) {
            where.append(" and p.startedAt < :to");
            params.put("to", AppTime.startOfDayUtc(to.plusDays(1)));
        }
        if (anomalousOnly) {
            where.append(" and ").append(ANOMALY_JPQL);
            params.put("completed", PracticeSessionStatus.COMPLETED);
            params.put("inProgress", PracticeSessionStatus.IN_PROGRESS);
            params.put("stuckBefore", now.minusSeconds(LONG_SECONDS));
        }

        var countQuery = entityManager.createQuery(
                "select count(p) from PracticeSession p join p.member m join p.score s" + where, Long.class);
        params.forEach(countQuery::setParameter);
        long total = countQuery.getSingleResult();

        var query = entityManager.createQuery(
                "select p from PracticeSession p join fetch p.member m join fetch p.score s" + where
                        + " order by p.startedAt desc, p.id",
                PracticeSession.class);
        params.forEach(query::setParameter);
        List<PracticeSession> sessions = query.setFirstResult(safePage * safeSize)
                .setMaxResults(safeSize)
                .getResultList();

        List<AdminPracticeSessionResponse> content =
                sessions.stream().map(p -> toResponse(p, now)).toList();
        return PageResponse.<AdminPracticeSessionResponse>builder()
                .content(content)
                .pageNumber(safePage)
                .pageSize(safeSize)
                .totalElements(total)
                .totalPages((int) Math.ceil(total / (double) safeSize))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public AdminPracticeSessionResponse.Overview overview(LocalDate from, LocalDate to) {
        LocalDate end = to == null ? AppTime.today() : to;
        LocalDate start = from == null ? end.minusDays(DEFAULT_DAYS - 1L) : from;
        if (start.isAfter(end) || ChronoUnit.DAYS.between(start, end) >= MAX_DAYS) {
            throw new AppException(LibraryErrorCode.PRACTICE_STATS_RANGE_INVALID);
        }
        LocalDateTime lo = AppTime.startOfDayUtc(start);
        LocalDateTime hi = AppTime.startOfDayUtc(end.plusDays(1));
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

        Object[] totals = entityManager
                .createQuery(
                        "select count(p), coalesce(sum(p.durationSeconds), 0), count(distinct p.member.id),"
                                + " avg(case when p.status = :completed then p.accuracyPct end),"
                                + " sum(case when p.status = :completed then 1 else 0 end),"
                                + " sum(case when p.status = :abandoned then 1 else 0 end)"
                                + " from PracticeSession p where p.startedAt >= :from and p.startedAt < :to",
                        Object[].class)
                .setParameter("completed", PracticeSessionStatus.COMPLETED)
                .setParameter("abandoned", PracticeSessionStatus.ABANDONED)
                .setParameter("from", lo)
                .setParameter("to", hi)
                .getSingleResult();
        long completed = totals[4] == null ? 0 : ((Number) totals[4]).longValue();
        long abandoned = totals[5] == null ? 0 : ((Number) totals[5]).longValue();

        long anomalous = entityManager
                .createQuery(
                        "select count(p) from PracticeSession p where p.startedAt >= :from and p.startedAt < :to and "
                                + ANOMALY_JPQL,
                        Long.class)
                .setParameter("from", lo)
                .setParameter("to", hi)
                .setParameter("completed", PracticeSessionStatus.COMPLETED)
                .setParameter("inProgress", PracticeSessionStatus.IN_PROGRESS)
                .setParameter("stuckBefore", now.minusSeconds(LONG_SECONDS))
                .getSingleResult();

        Map<LocalDate, Object[]> byDay = new HashMap<>();
        for (Object[] r : entityManager
                .createQuery(
                        "select " + AppTime.localDate("p.startedAt") + ", count(p), coalesce(sum(p.durationSeconds), 0)"
                                + " from PracticeSession p where p.startedAt >= :from and p.startedAt < :to"
                                + " group by " + AppTime.localDate("p.startedAt"),
                        Object[].class)
                .setParameter("from", lo)
                .setParameter("to", hi)
                .getResultList()) {
            byDay.put(LocalDate.parse(r[0].toString()), r);
        }
        List<AdminPracticeSessionResponse.Day> days = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            Object[] r = byDay.get(d);
            days.add(new AdminPracticeSessionResponse.Day(
                    d,
                    r == null ? 0 : ((Number) r[1]).longValue(),
                    r == null ? 0 : minutes(((Number) r[2]).doubleValue())));
        }

        return AdminPracticeSessionResponse.Overview.builder()
                .from(start)
                .to(end)
                .sessions(((Number) totals[0]).longValue())
                .minutes(minutes(((Number) totals[1]).doubleValue()))
                .averageAccuracy(totals[3] == null ? null : Math.round(((Number) totals[3]).doubleValue() * 10) / 10.0)
                .completionRate(completed + abandoned == 0 ? null : completed / (double) (completed + abandoned))
                .activeMembers(((Number) totals[2]).longValue())
                .anomalous(anomalous)
                .byDay(days)
                .build();
    }

    @Override
    @Transactional
    @PreAuthorize("@perm.has('PRACTICE_MANAGE')")
    public void delete(String id) {
        PracticeSession session = practiceSessionRepository
                .findById(id)
                .orElseThrow(() -> new AppException(LibraryErrorCode.PRACTICE_SESSION_NOT_EXISTED));
        // Sự kiện nốt của buổi này bị xóa theo (khóa ngoại ON DELETE CASCADE)
        practiceSessionRepository.delete(session);
    }

    @Override
    @Transactional
    @PreAuthorize("@perm.has('PRACTICE_MANAGE')")
    public AdminPracticeSessionResponse close(String id) {
        PracticeSession session = practiceSessionRepository
                .findById(id)
                .orElseThrow(() -> new AppException(LibraryErrorCode.PRACTICE_SESSION_NOT_EXISTED));
        if (session.getStatus() != PracticeSessionStatus.IN_PROGRESS) {
            throw new AppException(LibraryErrorCode.STUDIO_SESSION_NOT_ACTIVE);
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        session.setStatus(PracticeSessionStatus.ABANDONED);
        session.setEndedAt(now);
        session.setIsCompleted(false);
        return toResponse(practiceSessionRepository.save(session), now);
    }

    private AdminPracticeSessionResponse toResponse(PracticeSession p, LocalDateTime now) {
        return AdminPracticeSessionResponse.builder()
                .id(p.getId())
                .memberId(p.getMember().getId())
                .memberEmail(p.getMember().getEmail())
                .memberName(p.getMember().getFullName())
                .scoreId(p.getScore().getId())
                .scoreTitle(p.getScore().getTitle())
                .mode(p.getMode() == null ? null : p.getMode().name())
                .status(p.getStatus().name())
                .startedAt(p.getStartedAt())
                .endedAt(p.getEndedAt())
                .durationSeconds(p.getDurationSeconds())
                .tempoPercent(p.getTempoPercent())
                .totalNotes(p.getTotalNotes())
                .accuracyPct(p.getAccuracyPct())
                .scorePoints(p.getScorePoints())
                .anomalies(anomalies(p, now))
                .canClose(p.getStatus() == PracticeSessionStatus.IN_PROGRESS)
                .build();
    }

    /** Dấu hiệu bất thường của một buổi; khớp với {@link #ANOMALY_JPQL}. */
    static List<String> anomalies(PracticeSession p, LocalDateTime now) {
        List<String> result = new ArrayList<>();
        boolean completed = p.getStatus() == PracticeSessionStatus.COMPLETED;
        Integer duration = p.getDurationSeconds();
        if (completed && duration != null && duration < SHORT_SECONDS) {
            result.add(ANOMALY_CODE_SHORT);
        }
        if (duration != null && duration > LONG_SECONDS) {
            result.add(ANOMALY_CODE_LONG);
        }
        if (completed
                && p.getTotalNotes() != null
                && p.getTotalNotes() > 0
                && (p.getAccuracyPct() == null || p.getAccuracyPct() == 0)) {
            result.add(ANOMALY_CODE_ZERO);
        }
        if (p.getStatus() == PracticeSessionStatus.IN_PROGRESS
                && p.getStartedAt() != null
                && Duration.between(p.getStartedAt(), now).getSeconds() > LONG_SECONDS) {
            result.add(ANOMALY_CODE_STUCK);
        }
        return result;
    }

    private static double minutes(double seconds) {
        return Math.round(seconds / 6.0) / 10.0;
    }

    private static PracticeMode parseMode(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return PracticeMode.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new AppException(AccountErrorCode.INVALID_REQUEST);
        }
    }

    private static PracticeSessionStatus parseStatus(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return PracticeSessionStatus.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new AppException(AccountErrorCode.INVALID_REQUEST);
        }
    }
}
