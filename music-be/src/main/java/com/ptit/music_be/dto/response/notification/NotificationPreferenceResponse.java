package com.ptit.music_be.dto.response.notification;

import com.ptit.music_be.dto.enums.notification.NotificationCategory;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class NotificationPreferenceResponse {
    NotificationCategory category;
    boolean inApp;
    boolean email;
}
