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
    boolean read;
    LocalDateTime createdAt;
}
