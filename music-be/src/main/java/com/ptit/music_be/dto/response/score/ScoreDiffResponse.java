package com.ptit.music_be.dto.response;

import com.fasterxml.jackson.databind.JsonNode;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/**
 * So sánh hai phiên bản MusicXML (thường là bản OMR sinh ra và bản người dùng đã sửa) để đo công sửa sau nhận diện.
 * {@code measures} và {@code summary} do music-ai tính (xem {@code app/analysis/diff.py}).
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreDiffResponse {
    /** Phiên bản gốc (bản OMR hoặc bản được chọn để so). */
    int baseVersion;

    /** Phiên bản cần so với bản gốc. */
    int targetVersion;

    /**
     * Mỗi phần tử {@code {base, target, status, errors[]}}: status là same, edited, deleted (OMR sinh thừa) hoặc added
     * (OMR bỏ sót); base/target là số ô từ 1, null nếu ô không có ở phía đó.
     */
    JsonNode measures;

    /** measureEditRate, noteErrorRate, same/edited/deleted/added và byType (PITCH, ACCIDENTAL, DURATION, TIMING, EXTRA, MISSING). */
    JsonNode summary;

    /** true nếu lấy từ kết quả đã lưu ở lần so sánh trước. */
    boolean cached;
}
