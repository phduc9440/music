package com.ptit.music_be.service.impl;

import java.time.LocalDate;
import java.util.List;
import java.util.NavigableSet;
import java.util.TreeSet;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.response.PracticeHeatmapDayResponse;
import com.ptit.music_be.dto.response.PracticeStreakResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.MemberRepository;
import com.ptit.music_be.repository.PracticeSessionRepository;
import com.ptit.music_be.service.PracticeStatsService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Ngày được tính theo giờ của server. Phiên tập dưới MIN_SECONDS giây không được tính là "có tập". */
@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class PracticeStatsServiceImpl implements PracticeStatsService {

    static int MIN_SECONDS = 60;
    static int DEFAULT_DAYS = 365;
    static int MAX_RANGE_DAYS = 400;
    static LocalDate EPOCH = LocalDate.of(2000, 1, 1);

    PracticeSessionRepository practiceSessionRepository;
    MemberRepository memberRepository;

    @Override
    @Transactional(readOnly = true)
    public List<PracticeHeatmapDayResponse> getHeatmap(LocalDate from, LocalDate to) {
        LocalDate end = to != null ? to : LocalDate.now();
        LocalDate start = from != null ? from : end.minusDays(DEFAULT_DAYS - 1L);
        if (start.isAfter(end) || start.plusDays(MAX_RANGE_DAYS).isBefore(end)) {
            throw new AppException(ErrorCode.PRACTICE_STATS_RANGE_INVALID);
        }
        return query(currentMember(), start, end);
    }

    @Override
    @Transactional(readOnly = true)
    public PracticeStreakResponse getStreak() {
        LocalDate today = LocalDate.now();
        NavigableSet<LocalDate> days = new TreeSet<>();
        for (PracticeHeatmapDayResponse d : query(currentMember(), EPOCH, today)) {
            days.add(d.getDate());
        }

        int longest = 0;
        int run = 0;
        LocalDate prev = null;
        for (LocalDate day : days) {
            run = prev != null && prev.plusDays(1).equals(day) ? run + 1 : 1;
            longest = Math.max(longest, run);
            prev = day;
        }

        // Chuỗi hiện tại: đếm lùi từ hôm nay, hoặc từ hôm qua nếu hôm nay chưa tập
        boolean practicedToday = days.contains(today);
        LocalDate cursor = practicedToday ? today : today.minusDays(1);
        int current = 0;
        while (days.contains(cursor)) {
            current++;
            cursor = cursor.minusDays(1);
        }

        return PracticeStreakResponse.builder()
                .currentStreak(current)
                .longestStreak(longest)
                .lastPracticeDate(days.isEmpty() ? null : days.last())
                .practicedToday(practicedToday)
                .build();
    }

    private List<PracticeHeatmapDayResponse> query(Member member, LocalDate from, LocalDate to) {
        return practiceSessionRepository
                .sumByDay(member, from.atStartOfDay(), to.plusDays(1).atStartOfDay(), MIN_SECONDS)
                .stream()
                .map(row -> PracticeHeatmapDayResponse.builder()
                        .date(toLocalDate(row[0]))
                        .sessionCount(((Number) row[1]).longValue())
                        .totalSeconds(((Number) row[2]).longValue())
                        .build())
                .toList();
    }

    private static LocalDate toLocalDate(Object value) {
        if (value instanceof LocalDate d) {
            return d;
        }
        return ((java.sql.Date) value).toLocalDate();
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }
}
