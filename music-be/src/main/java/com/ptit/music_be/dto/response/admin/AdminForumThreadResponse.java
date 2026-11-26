package com.ptit.music_be.dto.response.admin;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một chủ đề trong trang quản lý diễn đàn. Mọi số đều tính từ bảng bài / báo cáo khi trả về. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminForumThreadResponse {
    String id;
    String title;
    String excerpt;
    /** Chỉ có ở trang chi tiết. */
    String body;

    String categoryId;
    String categoryName;
    Person author;
    LocalDateTime createdAt;
    long replyCount;
    long hiddenReplyCount;
    /** Báo cáo đang chờ trên chủ đề này và trên các bài trả lời của nó. */
    long pendingReports;

    boolean hidden;
    Person hiddenBy;
    LocalDateTime hiddenAt;
    boolean pinned;
    boolean locked;
    boolean answered;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Person {
        String id;
        String email;
        String fullName;
    }
}
