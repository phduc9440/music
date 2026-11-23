package com.ptit.music_be.service.billing;

import java.util.List;
import java.util.function.Function;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Hạn mức của một gói (đọc từ cột JSON {@code plans.limits}). Số nguyên null hoặc thiếu khóa = không giới hạn; cờ
 * thiếu = không có quyền lợi đó.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record PlanLimits(
        Integer omrPagesPerMonth,
        Integer omrConcurrent,
        Integer storageMb,
        Integer keptVersions,
        Integer exportsPerMonth,
        Boolean collab,
        Boolean team,
        Boolean omrPriority,
        /** Số thành viên tối đa của mỗi team do người dùng gói này tạo (chỉ có nghĩa khi team = true). */
        Integer teamMembers,
        /** Số lần gợi ý hợp âm (R3) mỗi tháng. */
        Integer chordGenerationsPerMonth,
        /** Số phương án mỗi lần gợi ý hợp âm (1..3); null = tối đa. */
        Integer chordOptions,
        /** Được dùng tùy chọn hợp âm nâng cao: màu COLORFUL/JAZZY, độ sáng tạo BOLD, mật độ DENSE. */
        Boolean chordAdvanced,
        /** Số ô nhịp tối đa của bản nhạc được gợi ý hợp âm. */
        Integer chordMaxMeasures,
        /** Số trang tối đa của một lần số hóa OMR. */
        Integer omrMaxPagesPerJob) {

    /** Số phương án tối đa music-ai sinh được trong một lần gợi ý hợp âm. */
    public static final int MAX_CHORD_OPTIONS = 3;

    /** Số phương án gợi ý hợp âm của gói, kẹp trong 1..{@link #MAX_CHORD_OPTIONS}. */
    public int chordOptionsOrMax() {
        return chordOptions == null ? MAX_CHORD_OPTIONS : Math.max(1, Math.min(MAX_CHORD_OPTIONS, chordOptions));
    }

    /**
     * Hạn mức khi một người có cùng lúc nhiều gói (một gói cá nhân và một gói team): mỗi chỉ số lấy mức cao hơn, null
     * (không giới hạn) thắng mọi số; mỗi cờ bật nếu một gói bật. {@code teamMembers} chỉ tính từ các gói có quyền lợi team,
     * vì gói cá nhân không có khóa này (thiếu khóa không có nghĩa là team không giới hạn người).
     */
    public static PlanLimits merge(List<PlanLimits> all) {
        if (all.isEmpty()) {
            // Không có gói nào mà trả "không giới hạn" thì sai; người gọi luôn đưa ít nhất gói Free
            throw new IllegalArgumentException("Cần ít nhất một gói để gộp hạn mức");
        }
        if (all.size() == 1) {
            return all.getFirst();
        }
        List<PlanLimits> teamPlans =
                all.stream().filter(l -> Boolean.TRUE.equals(l.team())).toList();
        return new PlanLimits(
                highest(all, PlanLimits::omrPagesPerMonth),
                highest(all, PlanLimits::omrConcurrent),
                highest(all, PlanLimits::storageMb),
                highest(all, PlanLimits::keptVersions),
                highest(all, PlanLimits::exportsPerMonth),
                any(all, PlanLimits::collab),
                !teamPlans.isEmpty(),
                any(all, PlanLimits::omrPriority),
                teamPlans.isEmpty() ? null : highest(teamPlans, PlanLimits::teamMembers),
                highest(all, PlanLimits::chordGenerationsPerMonth),
                highest(all, PlanLimits::chordOptions),
                any(all, PlanLimits::chordAdvanced),
                highest(all, PlanLimits::chordMaxMeasures),
                highest(all, PlanLimits::omrMaxPagesPerJob));
    }

    private static Integer highest(List<PlanLimits> all, Function<PlanLimits, Integer> field) {
        Integer best = null;
        for (PlanLimits l : all) {
            Integer v = field.apply(l);
            if (v == null) {
                return null;
            }
            best = best == null ? v : Math.max(best, v);
        }
        return best;
    }

    private static boolean any(List<PlanLimits> all, Function<PlanLimits, Boolean> field) {
        return all.stream().anyMatch(l -> Boolean.TRUE.equals(field.apply(l)));
    }
}
