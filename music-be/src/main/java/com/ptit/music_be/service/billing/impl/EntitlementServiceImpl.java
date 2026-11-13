package com.ptit.music_be.service.billing.impl;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.EnumSet;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.billing.UsageMetric;
import com.ptit.music_be.dto.enums.score.FileType;
import com.ptit.music_be.dto.response.billing.PlanLimitPayload;
import com.ptit.music_be.entity.Plan;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.ai.AiTaskRepository;
import com.ptit.music_be.repository.billing.PlanRepository;
import com.ptit.music_be.repository.score.ScoreFileRepository;
import com.ptit.music_be.service.billing.EntitlementService;
import com.ptit.music_be.service.billing.PlanLimits;
import com.ptit.music_be.service.billing.SubscriptionService;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class EntitlementServiceImpl implements EntitlementService {

    private static final long BYTES_PER_MB = 1024L * 1024L;

    /** Loại file tính vào dung lượng: file người dùng tạo ra; bản xuất (MP3, WAV, PDF, SVG) là bộ nhớ đệm có job dọn. */
    private static final Set<FileType> STORED_TYPES = EnumSet.of(
            FileType.ORIGINAL_PDF,
            FileType.ORIGINAL_IMAGE,
            FileType.ORIGINAL_MUSICXML,
            FileType.ORIGINAL_MIDI,
            FileType.PNG,
            FileType.KERN,
            FileType.MUSICXML,
            FileType.MIDI);

    SubscriptionService subscriptionService;
    AiTaskRepository aiTaskRepository;
    PlanRepository planRepository;
    ScoreFileRepository scoreFileRepository;

    @Override
    @Transactional(readOnly = true)
    public PlanLimits limitsOf(String memberId) {
        return subscriptionService.effectiveLimits(memberId);
    }

    @Override
    @Transactional(readOnly = true)
    public void checkAvailable(String memberId, UsageMetric metric, int amount) {
        if (amount <= 0) {
            return;
        }
        Integer limit = limitFor(subscriptionService.effectiveLimits(memberId), metric);
        if (limit == null) {
            return;
        }
        int used = usedThisMonth(memberId, metric);
        if (used + amount > limit) {
            throw new AppException(
                    ErrorCode.PLAN_LIMIT_REACHED,
                    new PlanLimitPayload(
                            metric.name(), limit, used, upgradeTo(subscriptionService.currentPlan(memberId))));
        }
    }

    @Override
    @Transactional(readOnly = true)
    public void checkStorage(String memberId, long incomingBytes) {
        Integer limitMb = subscriptionService.effectiveLimits(memberId).storageMb();
        if (limitMb == null) {
            return;
        }
        long usedMb = megabytes(scoreFileRepository.sumBytesOwnedBy(
                memberId, STORED_TYPES.stream().map(Enum::name).toList()));
        if (usedMb + megabytes(incomingBytes) > limitMb) {
            throw new AppException(
                    ErrorCode.PLAN_LIMIT_REACHED,
                    new PlanLimitPayload(
                            "STORAGE_MB", limitMb, (int) usedMb, upgradeTo(subscriptionService.currentPlan(memberId))));
        }
    }

    private static long megabytes(long bytes) {
        return (Math.max(bytes, 0) + BYTES_PER_MB - 1) / BYTES_PER_MB;
    }

    @Override
    @Transactional(readOnly = true)
    public int usedThisMonth(String memberId, UsageMetric metric) {
        LocalDateTime from = YearMonth.now().atDay(1).atStartOfDay();
        LocalDateTime to = from.plusMonths(1);
        return switch (metric) {
            case OMR_PAGES -> (int) aiTaskRepository.sumOmrPagesCharged(memberId, from, to);
            case EXPORTS -> (int) aiTaskRepository.countExportsCharged(memberId, from, to);
        };
    }

    private static Integer limitFor(PlanLimits limits, UsageMetric metric) {
        return switch (metric) {
            case OMR_PAGES -> limits.omrPagesPerMonth();
            case EXPORTS -> limits.exportsPerMonth();
        };
    }

    /** Gói liền trên cùng nhóm (cá nhân / team) theo thứ tự sắp xếp; null nếu đã là gói cao nhất. */
    private String upgradeTo(Plan current) {
        return planRepository.findAllByOrderBySortOrderAsc().stream()
                .filter(p -> p.getSortOrder() > current.getSortOrder()
                        && java.util.Objects.equals(p.getAudience(), current.getAudience()))
                .findFirst()
                .map(Plan::getCode)
                .orElse(null);
    }
}
