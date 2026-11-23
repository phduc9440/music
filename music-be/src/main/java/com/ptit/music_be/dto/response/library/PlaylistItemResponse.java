package com.ptit.music_be.dto.response.library;

import com.ptit.music_be.dto.enums.score.DifficultyLevel;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một bài trong playlist. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class PlaylistItemResponse {
    String scoreId;
    String title;
    String composer;
    DifficultyLevel difficulty;
    Integer measureCount;
    /** Thứ tự bắt đầu từ 1. */
    int position;
}
