package com.ptit.music_be.service.score;

import com.ptit.music_be.dto.request.score.BlankScoreRequest;
import com.ptit.music_be.dto.response.score.BlankScoreResponse;

/** Tạo bản nhạc mới không đi qua tải file. */
public interface ScoreCreateService {

    /**
     * Tạo bản nhạc trống của người đang đăng nhập: sourceType = MANUAL, processingStatus = COMPLETED, riêng tư, đã có
     * MusicXML version 1 để mở thẳng trình chỉnh sửa.
     *
     * @throws com.ptit.music_be.exception.AppException SCORE_TITLE_INVALID (2017), SCORE_COMPOSER_INVALID (2018),
     *     BLANK_SCORE_OPTION_INVALID (3302)
     */
    BlankScoreResponse createBlank(BlankScoreRequest request);
}
