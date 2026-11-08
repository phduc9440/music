package com.ptit.music_be.dto.response;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreImportResponse {
    String scoreId;
    String title;
    String composer;
    String processingStatus;
    List<ScoreFileResponse> files;
}
