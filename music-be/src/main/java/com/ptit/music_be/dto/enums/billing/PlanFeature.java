package com.ptit.music_be.dto.enums.billing;

/** Quyền lợi bật/tắt theo gói: không có thì báo PLAN_LIMIT_REACHED với metric là tên hằng, {@code limit = 0}. */
public enum PlanFeature {
    /** Tùy chọn gợi ý hợp âm nâng cao: màu COLORFUL/JAZZY, độ sáng tạo BOLD, mật độ DENSE ({@code chordAdvanced}). */
    CHORD_ADVANCED
}
