package com.ptit.music_be.service.reward.impl;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import com.ptit.music_be.dto.response.reward.PointsResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.PointsLedgerEntry;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.reward.PointsLedgerRepository;
import com.ptit.music_be.service.reward.PointsService;
import com.ptit.music_be.utils.AppTime;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
@Slf4j
public class PointsServiceImpl implements PointsService {

    PointsLedgerRepository ledgerRepository;
    MemberRepository memberRepository;

    /**
     * Nghe sau khi hành động gốc commit (hành động lỗi/hoàn tác thì không có điểm), ghi trong transaction riêng. Lỗi sổ
     * điểm chỉ ghi log, không làm hỏng hành động gốc đã xong.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onRewardEarned(RewardEarnedEvent event) {
        try {
            award(event);
        } catch (RuntimeException e) {
            log.warn("Không cộng được điểm {} cho {}: {}", event.reason(), event.memberId(), e.getMessage());
        }
    }

    @Override
    @Transactional
    public boolean award(RewardEarnedEvent event) {
        if (event == null || event.memberId() == null || event.reason() == null || event.refId() == null) {
            return false;
        }
        RewardReason reason = event.reason();
        if (ledgerRepository.existsByReasonAndRefId(reason, event.refId())) {
            return false;
        }
        LocalDateTime since = windowStart(reason.window(), AppTime.today());
        if (reason.limit() > 0
                && since != null
                && ledgerRepository.countByMemberIdAndReasonAndCreatedAtGreaterThanEqual(
                                event.memberId(), reason, since)
                        >= reason.limit()) {
            return false;
        }
        try {
            ledgerRepository.saveAndFlush(PointsLedgerEntry.builder()
                    .memberId(event.memberId())
                    .reason(reason)
                    .refId(event.refId())
                    .xp(reason.xp())
                    .notes(reason.notes())
                    .build());
            return true;
        } catch (DataIntegrityViolationException e) {
            // Hai sự kiện cùng (reason, refId) tới cùng lúc: khóa duy nhất giữ lại một
            return false;
        }
    }

    /** Mốc đầu kỳ theo giờ Việt Nam, đổi ra UTC như cột created_at; NONE thì null (không giới hạn theo kỳ). */
    static LocalDateTime windowStart(RewardReason.Window window, LocalDate today) {
        LocalDate start =
                switch (window) {
                    case DAY -> today;
                    case WEEK -> today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                    case MONTH -> today.withDayOfMonth(1);
                    case NONE -> null;
                };
        return start == null ? null : AppTime.startOfDayUtc(start);
    }

    @Override
    @Transactional(readOnly = true)
    public PointsResponse mine() {
        Member me = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(AccountErrorCode.USER_NOT_EXISTED));
        List<Object[]> totals = ledgerRepository.totalsOf(me.getId());
        Object[] row = totals.isEmpty() ? new Object[] {0L, 0L} : totals.get(0);
        return PointsResponse.builder()
                .xp(((Number) row[0]).longValue())
                .notes(((Number) row[1]).longValue())
                .recent(ledgerRepository.findTop20ByMemberIdOrderByCreatedAtDesc(me.getId()).stream()
                        .map(e -> PointsResponse.Entry.builder()
                                .reason(e.getReason().name())
                                .refId(e.getRefId())
                                .xp(e.getXp())
                                .notes(e.getNotes())
                                .createdAt(e.getCreatedAt())
                                .build())
                        .toList())
                .build();
    }
}
