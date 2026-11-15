package com.ptit.music_be.dto.enums.score;

/** Mẫu nhạc cụ khi tạo bản nhạc trống: quyết định các part và khuông của bản. */
public enum BlankPreset {
    /** Một part piano, hai khuông (Sol và Fa). */
    PIANO,
    /** Part giọng hát (khuông Sol) và part piano hai khuông. */
    VOICE_PIANO,
    /** Một part guitar, khuông Sol hạ quãng tám. */
    GUITAR,
    /** Bốn part hợp xướng: Soprano, Alto, Tenor, Bass. */
    SATB
}
