package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.ptit.music_be.dto.enums.Visibility;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** ADMIN đặt thẳng chế độ hiển thị của một bản nhạc (PUBLIC hoặc PRIVATE), PRIVATE có thể kèm lý do. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminScoreVisibilityRequest {
    @NotNull(message = "INVALID_REQUEST")
    Visibility visibility;

    @Size(max = 255, message = "INVALID_REQUEST")
    String reason;
}
