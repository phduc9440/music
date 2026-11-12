package com.ptit.music_be.dto.response.score;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Người viết, người được nhắc hoặc người đánh dấu đã xử lý một góp ý (không lộ email). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class CommentMemberResponse {
    String id;
    String name;
    String avatarUrl;
}
