package com.ptit.music_be.service.score;

/**
 * Bộ lọc của trang Khám phá (mục 2.2 P1, 5.4). Giá trị null hoặc rỗng là không lọc.
 *
 * @param staffs số khuông: 1 (một bè: giọng hát, nhạc cụ một bè), 2 (piano hai khuông), 3 (từ ba khuông trở lên)
 * @param key khóa nhạc đúng như lưu trong bản nhạc, ví dụ "G", "Am"
 */
public record PublicScoreFilter(
        String keyword, String difficulty, String tagId, String composerId, Integer staffs, String key) {

    public static PublicScoreFilter of(String keyword, String difficulty, String tagId) {
        return new PublicScoreFilter(keyword, difficulty, tagId, null, null, null);
    }
}
