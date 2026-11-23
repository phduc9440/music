package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record StudioSessionFinishRequest(
        @NotNull @Min(0) @Max(86400) Integer durationSeconds,
        @NotNull Boolean reachedEnd,
        @NotNull @Min(0) Integer coveredUntilMs) {}
