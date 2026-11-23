package com.ptit.music_be.dto.response.admin;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminForumPostResponse {
    String id;
    String body;
    AdminForumThreadResponse.Person author;
    LocalDateTime createdAt;
    boolean hidden;
    AdminForumThreadResponse.Person hiddenBy;
    boolean accepted;
    long pendingReports;
}
