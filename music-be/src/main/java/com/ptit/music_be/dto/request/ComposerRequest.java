package com.ptit.music_be.dto.request;

import com.ptit.music_be.dto.enums.ComposerPeriod;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Admin tạo / sửa nhạc sĩ. Slug tự sinh từ tên. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ComposerRequest {
    String name;
    /** Tên khác, cách nhau bằng dấu phẩy. */
    String aliases;

    Integer birthYear;
    Integer deathYear;
    String country;
    ComposerPeriod period;
    String bio;
    /** Ảnh chân dung (https). Có ảnh thì bắt buộc có nguồn và giấy phép. */
    String imageUrl;

    String imageSource;
    String imageLicense;
}
