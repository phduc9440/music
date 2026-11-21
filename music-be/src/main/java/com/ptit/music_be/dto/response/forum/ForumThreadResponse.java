package com.ptit.music_be.dto.response.forum;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.forum.ForumReaction;

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
    /** Số lượt thích / không thích, tính từ forum_votes lúc đọc. */
    long likeCount;

    long dislikeCount;
    /** Lựa chọn của người đang xem; null khi chưa chọn hoặc là khách. */
    ForumReaction myReaction;

    boolean mine;
    boolean answered;
    /** Admin đã ghim: nổi lên đầu danh sách. */
    boolean pinned;
    /** Admin đã khóa: không trả lời thêm được. */
    boolean locked;

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
