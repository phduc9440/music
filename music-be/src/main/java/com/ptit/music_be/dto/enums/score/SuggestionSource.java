package com.ptit.music_be.dto.enums.score;

/** Nguồn của một đề xuất sửa. */
public enum SuggestionSource {
    /** Người dùng sửa trong Editor ở chế độ Đề xuất. */
    EDITOR,
    /** Hệ thống sinh hợp âm gợi ý (R3, làm cùng Công). */
    CHORD_GENERATION,
    /** Phiên cùng sửa không lưu được vì bản nhạc đã có version mới ngoài phiên: thay đổi của phiên được giữ thành đề xuất. */
    LIVE_RECOVERY
}
