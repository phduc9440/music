package com.ptit.music_be.dto.request.score;

import jakarta.validation.constraints.Size;

import com.ptit.music_be.dto.enums.score.DifficultyLevel;
import com.ptit.music_be.dto.enums.score.ScoreLicense;
import com.ptit.music_be.dto.enums.score.Visibility;
import com.ptit.music_be.utils.ScoreTitles;

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

    /** Tối đa 80 ký tự (ScoreTitles.MAX_LENGTH, T37); service kiểm lại sau khi bỏ khoảng trắng hai đầu. */
    @Size(max = ScoreTitles.MAX_LENGTH, message = "SCORE_TITLE_INVALID")
    String title;

    @Size(max = 255, message = "SCORE_COMPOSER_INVALID")
    String composer;

    DifficultyLevel difficulty;

    @Size(max = 5000, message = "SCORE_NOTES_INVALID")
    String studyNotes;

    Visibility visibility;

    /** Cho phép người xem tải MusicXML, MIDI, âm thanh, PDF. Chỉ chủ sở hữu được đổi. */
    Boolean allowDownload;

    /** Giấy phép (mục R4). Chỉ chủ sở hữu được đổi; bản phối của CC BY-SA / CC BY-NC không đổi được. */
    ScoreLicense license;

    /** Cho phép người khác tạo bản phối từ bản công khai này (R4). Cần giấy phép khác "bảo lưu mọi quyền". */
    Boolean allowArrange;
}
