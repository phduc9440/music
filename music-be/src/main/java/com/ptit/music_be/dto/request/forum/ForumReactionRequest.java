package com.ptit.music_be.dto.request.forum;

import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.forum.ForumReaction;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Thích hoặc không thích. Gửi lại đúng lựa chọn đang có là gỡ; gửi lựa chọn kia là đổi. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumReactionRequest {
    @NotNull
    ForumReaction reaction;
}
