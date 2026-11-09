package com.ptit.music_be.dto.request;

import java.time.LocalDateTime;

import com.fasterxml.jackson.databind.JsonNode;
import com.ptit.music_be.dto.enums.PracticeMode;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Kết quả một phiên tập do client gửi lên khi kết thúc. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PracticeSessionRequest {
    String scoreId;
    /** 1 = FREE, 2 = LOOP, 3 = TEST. */
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
    /** Không gửi thì BE tự tính. */
    Double accuracyPct;
    Double timingAccuracyPct;
    Double scorePoints;
    Boolean isCompleted;
    /** Mảng JSON log lỗi từng nốt (tối đa 5000 phần tử). */
    JsonNode errorLog;
}
