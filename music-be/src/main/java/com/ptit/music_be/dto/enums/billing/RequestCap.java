package com.ptit.music_be.dto.enums.billing;

/**
 * Hạn mức cho một lần dùng (không cộng dồn theo tháng): vượt thì báo PLAN_LIMIT_REACHED với metric là tên hằng, {@code used}
 * là kích thước của lần dùng đó.
 */
public enum RequestCap {
    /** Số trang của một lần số hóa OMR ({@code omrMaxPagesPerJob}). */
    OMR_PAGES_PER_JOB,
    /** Số ô nhịp của bản nhạc được gợi ý hợp âm ({@code chordMaxMeasures}). */
    CHORD_MEASURES
}
