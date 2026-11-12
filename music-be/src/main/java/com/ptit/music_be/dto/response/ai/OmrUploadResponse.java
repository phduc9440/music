package com.ptit.music_be.dto.response;

import java.util.List;

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
