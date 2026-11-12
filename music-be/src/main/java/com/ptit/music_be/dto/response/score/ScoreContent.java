package com.ptit.music_be.dto.response.score;

/**
 * Nội dung nhị phân/văn bản của một file kết quả cùng phiên bản MusicXML tương ứng (đặc tả mục 2.4). Dùng để controller
 * dựng ETag {@code "v{version}"} mà không phải đọc lại DB.
 *
 * @param bytes nội dung file
 * @param version version MusicXML của file (với MIDI là version MusicXML nguồn)
 */
public record ScoreContent(byte[] bytes, int version) {}
