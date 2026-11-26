package com.ptit.music_be.dto.response.admin;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Chủ đề kèm mọi bài trả lời, kể cả bài đã bị ẩn (để admin khôi phục). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminForumThreadDetailResponse {
    AdminForumThreadResponse thread;
    List<AdminForumPostResponse> posts;
}
