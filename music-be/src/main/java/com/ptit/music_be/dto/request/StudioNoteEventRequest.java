package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import com.ptit.music_be.dto.enums.StudioNoteEventResult;

public record StudioNoteEventRequest(
        @Min(0) Integer seq,
        @Size(max = 40) String noteId,
        @Positive Integer measure,
        @Size(max = 5) String hand,
        @Min(0) @Max(127) Integer expectedMidi,
        @Min(0) @Max(127) Integer playedMidi,
        @Min(0) Integer expectedMs,
        Integer playedMs,
        Integer deltaMs,
        StudioNoteEventResult result) {}
