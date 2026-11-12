package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.ptit.music_be.dto.enums.PracticeMode;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một phiên tập. Danh sách không kèm errorLog (chỉ có ở chi tiết). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PracticeSessionResponse {
    String id;
    String scoreId;
    String scoreTitle;
    PracticeMode mode;
    Double tempoPercent;
    Integer loopStartMeasure;
    Integer loopEndMeasure;
    LocalDateTime startedAt;
    LocalDateTime endedAt;
    Integer durationSeconds;
    Integer totalNotes;
    Integer perfectCount;
    Integer earlyCount;
    Integer lateCount;
    Integer wrongPitchCount;
    Integer missedCount;
    Double accuracyPct;
    Double timingAccuracyPct;
    Double scorePoints;
    Boolean isCompleted;
    JsonNode errorLog;
}
