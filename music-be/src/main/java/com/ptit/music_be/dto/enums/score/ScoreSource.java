package com.ptit.music_be.dto.enums;

/** Giá trị lưu trong {@code Score.sourceType}: bản nhạc được tạo bằng cách nào. */
public enum ScoreSource {
    /** Số hóa từ PDF/ảnh bằng OMR. */
    OMR,
    /** Nhập trực tiếp file MusicXML/MIDI. */
    IMPORT,
    /** Tạo tay trong Editor. */
    MANUAL
}
