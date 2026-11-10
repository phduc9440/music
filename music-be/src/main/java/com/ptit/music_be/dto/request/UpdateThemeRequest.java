package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.UiTheme;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UpdateThemeRequest {

    @NotNull(message = "INVALID_REQUEST")
    UiTheme theme;
}
