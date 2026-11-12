package com.ptit.music_be.dto.response.composer;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ComposerResponse {
    String id;
    String name;
    String slug;
    String aliases;
    Integer birthYear;
    Integer deathYear;
    String country;
    /** BAROQUE / CLASSICAL / ROMANTIC / MODERN / VIETNAM. */
    String period;

    String bio;
    String imageUrl;
    String imageSource;
    String imageLicense;
    /** Số bản công khai (trang công khai) hoặc tổng số bản đang gắn (trang admin). */
    long scoreCount;
    /** Chỉ có ở danh sách công khai: tối đa 3 tên bản công khai, xem nhiều nhất trước. */
    List<String> topTitles;
}
