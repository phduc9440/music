package com.ptit.music_be.dto.response.forum;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Chủ đề trong danh sách và trang chi tiết. Các số đều tính từ bảng bài / phiếu khi trả về. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ForumThreadResponse {
    String id;
    String categoryId;
    String categoryName;
    String categorySlug;
    String title;
    /** Chỉ có ở trang chi tiết; danh sách chỉ trả {@code excerpt}. */
    String body;

    String excerpt;
    ForumAuthorResponse author;
    ScoreRef score;
    long replyCount;
    long voteCount;
    boolean votedByMe;
    boolean mine;
    boolean answered;
    boolean subscribed;
    String acceptedPostId;
    LocalDateTime createdAt;
    LocalDateTime editedAt;
    LocalDateTime lastActivityAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class ScoreRef {
        String id;
        String title;
    }
}
