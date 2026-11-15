package com.ptit.music_be.dto.response.forum;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Người viết, chỉ gồm tên và ảnh (không lộ email). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumAuthorResponse {
    String id;
    String fullName;
    String avatarUrl;
}
