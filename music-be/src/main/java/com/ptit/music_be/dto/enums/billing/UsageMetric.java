package com.ptit.music_be.dto.enums.billing;

public enum UsageMetric {
    OMR_PAGES,
    /** Số lần xuất file (MP3, WAV, PDF, SVG) trong tháng; chuyển MIDI sang MusicXML không tính. */
    EXPORTS,
    /** Số lần gợi ý hợp âm (R3) trong tháng; task lỗi hoặc bị hủy không tính. */
    CHORD_GENERATIONS
}
