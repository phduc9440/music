package com.ptit.music_be.dto.response;

public record StudioEventBatchResponse(int accepted, int duplicates, Integer lastSeq) {}
