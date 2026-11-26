package com.ptit.music_be.client;

/** Bè giai điệu cho gợi ý hợp âm: thứ tự part (từ 0) và khuông trong part (từ 1); null là để music-ai tự chọn (CH-04). */
public record ChordMelody(Integer partIndex, Integer staff) {

    /** Null khi người dùng không chọn gì, để giữ nguyên lời gọi cũ. */
    public static ChordMelody of(Integer partIndex, Integer staff) {
        return partIndex == null && staff == null ? null : new ChordMelody(partIndex, staff);
    }
}
