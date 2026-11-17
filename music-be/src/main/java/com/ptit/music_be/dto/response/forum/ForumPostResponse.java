package com.ptit.music_be.dto.response.forum;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumPostResponse {
    String id;
    String threadId;
    String body;
    ForumAuthorResponse author;
    long voteCount;
    boolean votedByMe;
    boolean mine;
    boolean accepted;
    /** Bài được trả lời trực tiếp; null khi trả lời chủ đề hoặc bài kia đã bị xóa / ẩn. */
    ReplyRef replyTo;

    LocalDateTime createdAt;
    LocalDateTime editedAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class ReplyRef {
        String postId;
        String authorName;
        String excerpt;
    }
}
