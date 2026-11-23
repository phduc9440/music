package com.ptit.music_be.dto.response;

import java.time.Instant;

import com.ptit.music_be.dto.enums.PracticeSessionStatus;
import com.ptit.music_be.dto.enums.StudioHandMode;
import com.ptit.music_be.dto.enums.StudioInputSource;
import com.ptit.music_be.dto.enums.StudioMode;

public record StudioSessionResponse(
        String sessionId,
        String scoreId,
        StudioMode mode,
        StudioInputSource inputSource,
        StudioHandMode handMode,
        PracticeSessionStatus status,
        int tempoPercent,
        Integer loopStartMeasure,
        Integer loopEndMeasure,
        Instant startedAt,
        Instant serverTime,
        int scorableNotesInRange) {}
