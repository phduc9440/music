package com.ptit.music_be.service.practice.impl;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.NavigableSet;
import java.util.TreeSet;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.response.practice.PracticeHeatmapDayResponse;
import com.ptit.music_be.dto.response.practice.PracticeSkillsResponse;
import com.ptit.music_be.dto.response.practice.PracticeStreakResponse;
import com.ptit.music_be.dto.response.practice.PracticeTimeBucketResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.practice.PracticeSessionRepository;
import com.ptit.music_be.service.practice.PracticeStatsService;
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
    static int DEFAULT_SKILL_DAYS = 30;
    static int MIN_SKILL_DAYS = 7;
    static int MAX_SKILL_DAYS = 90;
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
    public List<PracticeTimeBucketResponse> getTimeStats(String period, Integer count) {
        String p = period == null ? "" : period.trim().toUpperCase();
        int defaultCount;
        int maxCount;
        switch (p) {
            case "DAY" -> {
                defaultCount = 30;
                maxCount = 90;
            }
            case "WEEK" -> {
                defaultCount = 12;
                maxCount = 52;
            }
            case "MONTH" -> {
                defaultCount = 12;
                maxCount = 24;
            }
            default -> throw new AppException(ErrorCode.PRACTICE_STATS_PERIOD_INVALID);
        }
        int n = count == null ? defaultCount : Math.min(Math.max(count, 1), maxCount);

        // Các chu kỳ [start, end], cũ nhất trước, chu kỳ cuối chứa hôm nay
        LocalDate today = LocalDate.now();
        List<LocalDate[]> ranges = new ArrayList<>();
        for (int i = n - 1; i >= 0; i--) {
            switch (p) {
                case "DAY" -> {
                    LocalDate d = today.minusDays(i);
                    ranges.add(new LocalDate[] {d, d});
                }
                case "WEEK" -> {
                    LocalDate start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                            .minusWeeks(i);
                    ranges.add(new LocalDate[] {start, start.plusDays(6)});
                }
                default -> {
                    LocalDate start = today.withDayOfMonth(1).minusMonths(i);
                    ranges.add(new LocalDate[] {start, start.with(TemporalAdjusters.lastDayOfMonth())});
                }
            }
        }

        // Mọi phiên đều tính vào thời gian tập (khác với chuỗi ngày, không có ngưỡng 60 giây)
        List<PracticeHeatmapDayResponse> days =
                queryAll(currentMember(), ranges.get(0)[0], ranges.get(ranges.size() - 1)[1]);

        List<PracticeTimeBucketResponse> result = new ArrayList<>();
        for (LocalDate[] range : ranges) {
            long seconds = 0;
            long sessions = 0;
            for (PracticeHeatmapDayResponse d : days) {
                if (!d.getDate().isBefore(range[0]) && !d.getDate().isAfter(range[1])) {
                    seconds += d.getTotalSeconds();
                    sessions += d.getSessionCount();
                }
            }
            result.add(PracticeTimeBucketResponse.builder()
                    .start(range[0])
                    .end(range[1])
                    .totalSeconds(seconds)
                    .sessionCount(sessions)
                    .build());
        }
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public PracticeSkillsResponse getSkills(Integer days) {
        int n = days == null ? DEFAULT_SKILL_DAYS : days;
        if (n < MIN_SKILL_DAYS || n > MAX_SKILL_DAYS) {
            throw new AppException(ErrorCode.PRACTICE_STATS_DAYS_INVALID);
        }
        Member me = currentMember();
        LocalDate today = LocalDate.now();
        LocalDate start = today.minusDays(n - 1L);

        Object[] row = practiceSessionRepository
                .skillTotals(me, start.atStartOfDay(), today.plusDays(1).atStartOfDay())
                .get(0);
        long sessions = ((Number) row[0]).longValue();
        double totalNotes = ((Number) row[1]).doubleValue();
        double perfect = ((Number) row[2]).doubleValue();
        double early = ((Number) row[3]).doubleValue();
        double late = ((Number) row[4]).doubleValue();
        double tempoWeighted = ((Number) row[5]).doubleValue();
        double notesWithTempo = ((Number) row[6]).doubleValue();

        // Pitch Accuracy: nốt đúng cao độ (đúng giờ + sớm + trễ) / tổng nốt
        double pitch = totalNotes > 0 ? (perfect + early + late) * 100 / totalNotes : 0;
        // Timing: nốt đúng giờ / tổng nốt
        double timing = totalNotes > 0 ? perfect * 100 / totalNotes : 0;
        // Tốc độ ngón: tempo trung bình (có trọng số theo số nốt), 100% tempo bản gốc = 100 điểm, tối đa 100
        double speed = notesWithTempo > 0 ? Math.min(100, tempoWeighted / notesWithTempo) : 0;
        // Chăm chỉ: số ngày có tập (từ 60 giây) / số ngày trong kỳ
        long practicedDays = query(me, start, today).size();
        double diligence = practicedDays * 100.0 / n;

        return PracticeSkillsResponse.builder()
                .days(n)
                .sessionCount(sessions)
                .pitchAccuracy(round1(pitch))
                .timing(round1(timing))
                .speed(round1(speed))
                .diligence(round1(diligence))
                .build();
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
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
        return queryWithMin(member, from, to, MIN_SECONDS);
    }

    private List<PracticeHeatmapDayResponse> queryAll(Member member, LocalDate from, LocalDate to) {
        return queryWithMin(member, from, to, 0);
    }

    private List<PracticeHeatmapDayResponse> queryWithMin(Member member, LocalDate from, LocalDate to, int minSeconds) {
        return practiceSessionRepository
                .sumByDay(member, from.atStartOfDay(), to.plusDays(1).atStartOfDay(), minSeconds)
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
