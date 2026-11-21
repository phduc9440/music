package com.ptit.music_be.dto.response.forum;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.forum.ForumReaction;

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
    /** Số lượt thích / không thích, tính từ forum_votes lúc đọc. */
    long likeCount;

    long dislikeCount;
    /** Lựa chọn của người đang xem; null khi chưa chọn hoặc là khách. */
    ForumReaction myReaction;

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
