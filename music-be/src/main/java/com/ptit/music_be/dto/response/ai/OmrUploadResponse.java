package com.ptit.music_be.dto.response.ai;

import java.util.List;

import com.ptit.music_be.dto.response.score.ScoreFileResponse;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class OmrUploadResponse {
    String scoreId;
    String title;
    String processingStatus;
    AiTaskResponse task;
    List<ScoreFileResponse> files;
}
