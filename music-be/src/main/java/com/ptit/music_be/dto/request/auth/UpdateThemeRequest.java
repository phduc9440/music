package com.ptit.music_be.dto.request.auth;

import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.auth.UiTheme;

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
