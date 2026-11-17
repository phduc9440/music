package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import com.ptit.music_be.dto.enums.StudioHandMode;
import com.ptit.music_be.dto.enums.StudioInputSource;
import com.ptit.music_be.dto.enums.StudioMode;

public record StudioSessionCreateRequest(
        @NotBlank String scoreId,
        @NotNull StudioMode mode,
        @NotNull StudioInputSource inputSource,
        @NotNull StudioHandMode handMode,
        @NotNull @Min(20) @Max(200) Integer tempoPercent,
        @Positive Integer loopStartMeasure,
        @Positive Integer loopEndMeasure) {}
