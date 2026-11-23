package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.StudioMode;

public record StudioSessionSummaryResponse(
        String id,
        String scoreId,
        String title,
        StudioMode mode,
        int tempoPercent,
        Integer durationSeconds,
        LocalDateTime startedAt,
        Integer scorePoints,
        Double accuracyPct,
        Double timingAccuracyPct,
        String grade) {}
