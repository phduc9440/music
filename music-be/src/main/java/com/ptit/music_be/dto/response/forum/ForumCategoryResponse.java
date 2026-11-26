package com.ptit.music_be.dto.response.forum;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumCategoryResponse {
    String id;
    String slug;
    String name;
    String description;
    /** Đếm từ bảng chủ đề khi trả về, không lưu. */
    long threadCount;
}
