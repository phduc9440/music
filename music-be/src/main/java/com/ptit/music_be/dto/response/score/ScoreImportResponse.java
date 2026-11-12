package com.ptit.music_be.dto.response.score;

import java.util.List;

import com.ptit.music_be.dto.response.library.TagResponse;

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
    List<TagResponse> tags;
    List<ScoreFileResponse> files;
}
