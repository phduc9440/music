package com.ptit.music_be.dto.response.forum;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Chủ đề kèm bài trả lời. Bài được chọn hay nhất luôn đứng đầu, còn lại theo thời gian. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumThreadDetailResponse {
    ForumThreadResponse thread;
    List<ForumPostResponse> posts;
}
