package com.ptit.music_be.utils;

/**
 * Thông tin tóm tắt đọc từ MusicXML, dùng để cập nhật các cột của bảng scores sau khi Editor lưu.
 *
 * @param measureCount số ô nhịp (số {@code <measure>} của part đầu tiên)
 * @param keySignature khóa nhạc theo định dạng {@code G}, {@code Bb}, {@code F#m}; null nếu không có hoặc ngoài -7..7
 * @param timeSignature số chỉ nhịp đầu tiên, ví dụ {@code 3/4}; null nếu không có
 * @param tempoBpm tempo từ {@code <sound tempo>} đầu tiên, mặc định 100 nếu không có
 * @param staffCount số khuông nhạc ({@code <staves>} lớn nhất, mặc định 1)
 */
public record MusicXmlSummary(
        int measureCount, String keySignature, String timeSignature, int tempoBpm, int staffCount) {}
