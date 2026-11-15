package com.ptit.music_be.service.score;

import com.ptit.music_be.dto.response.score.ScoreDiffResponse;

/** So sánh hai phiên bản MusicXML để đo công sửa sau khi số hóa (OMR). */
public interface ScoreDiffService {

    /**
     * So phiên bản {@code version} với phiên bản gốc {@code base}. Bỏ trống {@code base} thì dùng phiên bản do nhận diện
     * sinh ra (phiên bản nhỏ nhất không do người dùng lưu hoặc khôi phục). Kết quả lưu vào {@code meta.diffs.{base}} của
     * file MusicXML {@code version} nên lần sau trả ngay. Cần quyền xem bản nhạc.
     *
     * <p>Lỗi: SCORE_NOT_EXISTED (2001), UNAUTHORIZED (1002), SCORE_VERSION_NOT_EXISTED (2801), SCORE_DIFF_NO_BASE (2901),
     * SCORE_DIFF_SAME_VERSION (2902), SCORE_DIFF_FAILED (2903), AI_SERVICE_UNAVAILABLE (2103).
     */
    ScoreDiffResponse diff(String scoreId, int version, Integer base);
}
