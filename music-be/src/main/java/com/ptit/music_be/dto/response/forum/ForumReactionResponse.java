package com.ptit.music_be.dto.response.forum;

import com.ptit.music_be.dto.enums.forum.ForumReaction;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Kết quả sau khi thích / không thích: lựa chọn hiện tại của mình (null = chưa chọn) và số đếm mới tính lại. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumReactionResponse {
    ForumReaction myReaction;
    long likeCount;
    long dislikeCount;
}
