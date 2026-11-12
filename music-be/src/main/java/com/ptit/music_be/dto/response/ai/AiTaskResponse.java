package com.ptit.music_be.dto.response.ai;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonRawValue;
import com.ptit.music_be.dto.enums.ai.AiTaskStatus;
import com.ptit.music_be.dto.enums.ai.AiTaskType;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AiTaskResponse {
    String id;
    String scoreId;
    AiTaskType taskType;
    AiTaskStatus status;
    Integer progress;
    /** Bước đang chạy (SPLIT_PDF, PREPROCESS, ...), có thể null. */
    String step;

    String errorMessage;

    @JsonRawValue
    String resultData;

    LocalDateTime createdAt;
    LocalDateTime startedAt;
    LocalDateTime finishedAt;
}
