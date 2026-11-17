package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.ptit.music_be.dto.enums.StudioMode;

public record StudioSessionReportResponse(
        String sessionId,
        String scoreId,
        String title,
        StudioMode mode,
        int tempoPercent,
        Integer durationSeconds,
        boolean isCompleted,
        int scorePoints,
        String grade,
        Double accuracyPct,
        Double timingAccuracyPct,
        StudioSessionCounts counts,
        List<StudioMeasureBreakdown> measureBreakdown,
        List<Integer> weakestMeasures,
        StudioSessionComparison comparison,
        LocalDateTime startedAt) {}
