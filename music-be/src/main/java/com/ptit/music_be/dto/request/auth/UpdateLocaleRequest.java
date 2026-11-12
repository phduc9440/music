package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.NotNull;

import com.ptit.music_be.dto.enums.AppLocale;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UpdateLocaleRequest {

    @NotNull(message = "INVALID_REQUEST")
    AppLocale locale;
}
