package com.ptit.music_be.dto.request;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record StudioEventBatchRequest(@NotNull List<@Valid StudioNoteEventRequest> events) {}
