package com.ptit.music_be.dto.response.admin;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Thể loại kèm số bản nhạc đang dùng, cho trang quản trị. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminTagResponse {
    String id;
    String name;
    String slug;
    long scoreCount;
}
