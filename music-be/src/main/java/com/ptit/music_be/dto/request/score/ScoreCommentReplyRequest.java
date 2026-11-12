package com.ptit.music_be.dto.request;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Trả lời một góp ý (mục 4.2). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreCommentReplyRequest {
    String content;
    List<String> mentionIds;
}
