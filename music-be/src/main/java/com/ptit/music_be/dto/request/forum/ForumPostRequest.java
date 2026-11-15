package com.ptit.music_be.dto.request.forum;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumPostRequest {
    String body;
    /** Trả lời trực tiếp vào bài này (cùng chủ đề); bỏ trống = trả lời chủ đề. Chỉ dùng khi tạo. */
    String replyToPostId;
}
