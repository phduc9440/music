package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonRawValue;
import com.ptit.music_be.dto.enums.AiTaskStatus;
import com.ptit.music_be.dto.enums.AiTaskType;

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
    String errorMessage;

    @JsonRawValue
    String resultData;

    LocalDateTime createdAt;
    LocalDateTime startedAt;
    LocalDateTime finishedAt;
}
