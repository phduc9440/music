package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.NotificationType;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class NotificationResponse {
    String id;
    NotificationType type;
    String scoreId;
    String message;
    /** Tham số để dựng câu theo ngôn ngữ (null với thông báo cũ hoặc thông báo tự do của admin). */
    java.util.Map<String, String> params;

    boolean read;
    LocalDateTime createdAt;
}
