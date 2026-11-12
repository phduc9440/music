package com.ptit.music_be.service.admin.impl;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.EntityManager;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;
import com.ptit.music_be.dto.response.admin.AdminAiTaskResponse;
import com.ptit.music_be.dto.response.ai.AiTaskResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.entity.AiTask;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.service.admin.AdminAiTaskService;
import com.ptit.music_be.service.ai.OmrService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@PreAuthorize("hasRole('ADMIN')")
public class AdminAiTaskServiceImpl implements AdminAiTaskService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 100;
    static final List<AiTaskStatus> ACTIVE = List.of(AiTaskStatus.PENDING, AiTaskStatus.PROCESSING);
    static final List<AiTaskStatus> RETRYABLE = List.of(AiTaskStatus.FAILED, AiTaskStatus.CANCELLED);

    EntityManager entityManager;
    AiTaskRepository aiTaskRepository;
    OmrService omrService;

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AdminAiTaskResponse> list(
            int page, int size, String status, String type, String keyword, LocalDate from, LocalDate to) {
        int safeSize = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        AiTaskStatus st = parse(status, AiTaskStatus.class);
        AiTaskType tp = parse(type, AiTaskType.class);
        String kw = keyword == null ? "" : keyword.trim().toLowerCase();
        if (kw.length() > 100) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }

        // Dựng điều kiện theo bộ lọc đang dùng (tránh tham số null kiểu enum mà Hibernate không suy được kiểu)
        StringBuilder where = new StringBuilder(" where 1 = 1");
        Map<String, Object> params = new HashMap<>();
        if (st != null) {
            where.append(" and t.status = :status");
            params.put("status", st);
        }
        if (tp != null) {
            where.append(" and t.taskType = :type");
            params.put("type", tp);
        }
        if (!kw.isEmpty()) {
            where.append(" and (lower(coalesce(s.title, '')) like :kw or lower(m.email) like :kw)");
            params.put("kw", "%" + kw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (from != null) {
            where.append(" and t.createdAt >= :from");
            params.put("from", from.atStartOfDay());
        }
        if (to != null) {
            where.append(" and t.createdAt < :to");
            params.put("to", to.plusDays(1).atStartOfDay());
        }

        var countQuery = entityManager.createQuery(
                "select count(t) from AiTask t left join t.score s join t.member m" + where, Long.class);
        params.forEach(countQuery::setParameter);
        long total = countQuery.getSingleResult();

        var query = entityManager.createQuery(
                "select t from AiTask t left join fetch t.score s join fetch t.member m" + where
                        + " order by t.createdAt desc, t.id",
                AiTask.class);
        params.forEach(query::setParameter);
        List<AiTask> tasks = query.setFirstResult(safePage * safeSize)
                .setMaxResults(safeSize)
                .getResultList();

        LocalDateTime now = LocalDateTime.now();
        List<AdminAiTaskResponse> content =
                tasks.stream().map(t -> toResponse(t, now, false)).toList();
        int totalPages = (int) Math.ceil(total / (double) safeSize);
        return PageResponse.<AdminAiTaskResponse>builder()
                .content(content)
                .pageNumber(safePage)
                .pageSize(safeSize)
                .totalElements(total)
                .totalPages(totalPages)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public AdminAiTaskResponse.Summary summary() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime dayAgo = now.minusHours(24);
        List<AdminAiTaskResponse.TypeAverage> averages = entityManager
                .createQuery(
                        "select t.taskType, t.startedAt, t.finishedAt from AiTask t where t.status = :done"
                                + " and t.finishedAt >= :since and t.startedAt is not null",
                        Object[].class)
                .setParameter("done", AiTaskStatus.COMPLETED)
                .setParameter("since", now.minusDays(7))
                .getResultList()
                .stream()
                // tính trung bình ở Java: JPQL không có hàm hiệu thời gian chung cho mọi CSDL
                .collect(java.util.stream.Collectors.groupingBy(
                        r -> (AiTaskType) r[0], java.util.stream.Collectors.summarizingLong(r -> Duration.between(
                                        (LocalDateTime) r[1], (LocalDateTime) r[2])
                                .getSeconds())))
                .entrySet()
                .stream()
                .map(e -> new AdminAiTaskResponse.TypeAverage(
                        e.getKey(),
                        Math.round(e.getValue().getAverage() * 10) / 10.0,
                        e.getValue().getCount()))
                .sorted(java.util.Comparator.comparing(a -> a.getTaskType().name()))
                .toList();
        return AdminAiTaskResponse.Summary.builder()
                .pending(countStatus(AiTaskStatus.PENDING, null))
                .processing(countStatus(AiTaskStatus.PROCESSING, null))
                .failedLast24h(countStatus(AiTaskStatus.FAILED, dayAgo))
                .completedLast24h(countStatus(AiTaskStatus.COMPLETED, dayAgo))
                .averageRunSeconds(averages)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public AdminAiTaskResponse detail(String taskId) {
        return toResponse(find(taskId), LocalDateTime.now(), true);
    }

    @Override
    @Transactional
    public AdminAiTaskResponse retry(String taskId) {
        AiTask task = find(taskId);
        if (task.getTaskType() != AiTaskType.OMR_CONVERSION
                || !RETRYABLE.contains(task.getStatus())
                || task.getScore() == null) {
            throw new AppException(ErrorCode.AI_TASK_NOT_RETRYABLE);
        }
        AiTaskResponse created = omrService.retryAsAdmin(task.getScore().getId());
        return toResponse(find(created.getId()), LocalDateTime.now(), false);
    }

    private long countStatus(AiTaskStatus status, LocalDateTime since) {
        String jpql = "select count(t) from AiTask t where t.status = :s"
                + (since == null ? "" : " and t.updatedAt >= :since");
        var q = entityManager.createQuery(jpql, Long.class).setParameter("s", status);
        if (since != null) {
            q.setParameter("since", since);
        }
        return q.getSingleResult();
    }

    private AiTask find(String taskId) {
        return aiTaskRepository.findById(taskId).orElseThrow(() -> new AppException(ErrorCode.AI_TASK_NOT_EXISTED));
    }

    private AdminAiTaskResponse toResponse(AiTask t, LocalDateTime now, boolean withData) {
        boolean active = ACTIVE.contains(t.getStatus());
        LocalDateTime waitEnd = t.getStartedAt() != null ? t.getStartedAt() : (active ? now : t.getFinishedAt());
        LocalDateTime runEnd = t.getFinishedAt() != null ? t.getFinishedAt() : (active ? now : null);
        boolean canRetry = t.getTaskType() == AiTaskType.OMR_CONVERSION
                && RETRYABLE.contains(t.getStatus())
                && t.getScore() != null
                && !aiTaskRepository.existsByScoreIdAndTaskTypeAndStatusIn(
                        t.getScore().getId(), AiTaskType.OMR_CONVERSION, ACTIVE);
        return AdminAiTaskResponse.builder()
                .id(t.getId())
                .taskType(t.getTaskType())
                .status(t.getStatus())
                .step(t.getStep())
                .progress(t.getProgress())
                .errorMessage(t.getErrorMessage())
                .retryCount(t.getRetryCount())
                .scoreId(t.getScore() == null ? null : t.getScore().getId())
                .scoreTitle(t.getScore() == null ? null : t.getScore().getTitle())
                .memberEmail(t.getMember() == null ? null : t.getMember().getEmail())
                .createdAt(t.getCreatedAt())
                .startedAt(t.getStartedAt())
                .finishedAt(t.getFinishedAt())
                .waitSeconds(seconds(t.getCreatedAt(), waitEnd))
                .runSeconds(t.getStartedAt() == null ? null : seconds(t.getStartedAt(), runEnd))
                .canCancel(active)
                .canRetry(canRetry)
                .inputData(withData ? t.getInputData() : null)
                .resultData(withData ? t.getResultData() : null)
                .build();
    }

    private static Long seconds(LocalDateTime from, LocalDateTime to) {
        return from == null || to == null
                ? null
                : Math.max(0, Duration.between(from, to).getSeconds());
    }

    private static <E extends Enum<E>> E parse(String value, Class<E> type) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }
}
