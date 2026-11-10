package com.ptit.music_be.dto.request;

import jakarta.validation.constraints.Size;

import com.ptit.music_be.dto.enums.DifficultyLevel;
import com.ptit.music_be.dto.enums.Visibility;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Body của PATCH /api/scores/{id}. Trường nào null thì giữ nguyên giá trị cũ.
 * Lưu ý: message của annotation phải là tên một ErrorCode (GlobalExceptionHandler dùng ErrorCode.valueOf).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreUpdateRequest {

    @Size(max = 255, message = "SCORE_TITLE_INVALID")
    String title;

    @Size(max = 255, message = "SCORE_COMPOSER_INVALID")
    String composer;

    DifficultyLevel difficulty;

    @Size(max = 5000, message = "SCORE_NOTES_INVALID")
    String studyNotes;

    Visibility visibility;

    /** Cho phép người xem tải MusicXML, MIDI, âm thanh, PDF. Chỉ chủ sở hữu được đổi. */
    Boolean allowDownload;
}
