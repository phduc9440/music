package com.ptit.music_be.dto.response;

public record StudioMeasureBreakdown(int measure, int perfect, int early, int late, int wrongPitch, int missed) {}
