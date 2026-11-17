package com.ptit.music_be.dto.request.forum;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Tạo / sửa chủ đề. {@code categoryId} và {@code scoreId} chỉ dùng khi tạo (sửa thì giữ nguyên chuyên mục; scoreId trống = gỡ bản gắn). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumThreadRequest {
    String categoryId;
    String title;
    String body;
    String scoreId;
}
