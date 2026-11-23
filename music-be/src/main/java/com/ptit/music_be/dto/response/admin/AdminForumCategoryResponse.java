package com.ptit.music_be.dto.response.admin;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminForumCategoryResponse {
    String id;
    String slug;
    String name;
    String description;
    int sortOrder;
    /** Đếm từ bảng chủ đề khi trả về (kể cả chủ đề đã ẩn), không lưu. */
    long threadCount;

    long hiddenThreadCount;
}
