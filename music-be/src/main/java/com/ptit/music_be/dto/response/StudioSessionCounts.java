package com.ptit.music_be.dto.response;

public record StudioSessionCounts(int total, int perfect, int early, int late, int wrongPitch, int missed) {}
