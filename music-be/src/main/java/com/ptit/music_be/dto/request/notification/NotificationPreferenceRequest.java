package com.ptit.music_be.dto.request.notification;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.notification.NotificationCategory;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class NotificationPreferenceRequest {

    @NotEmpty
    @Valid
    List<Item> items;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Item {
        @NotNull
        NotificationCategory category;

        boolean inApp;
        boolean email;
    }
}
