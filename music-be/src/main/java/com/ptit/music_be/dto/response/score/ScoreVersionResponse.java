package com.ptit.music_be.dto.response.score;

import java.time.LocalDateTime;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/** Một phiên bản MusicXML trong lịch sử của bản nhạc (đặc tả mục 3.6). */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreVersionResponse {
    int version;
    LocalDateTime createdAt;
    /** Tên người lưu; null với bản do hệ thống tạo (OMR, nhập file) hoặc bản cũ chưa ghi thông tin. */
    String savedByName;
    /** Số ô nhịp lúc lưu; null nếu không ghi nhận. */
    Integer measureCount;

    Long sizeBytes;
    /** Boolean (không phải boolean) để JSON giữ tên "isCurrent" như các DTO file khác. */
    Boolean isCurrent;
    /** EDITOR (lưu từ trình chỉnh sửa), OMR, IMPORT, RESTORE (khôi phục từ phiên bản cũ), SUGGESTION (nhận đề xuất sửa). */
    String source;
    /** Khi source = RESTORE: version được khôi phục. */
    Integer restoredFrom;
    /** Khi source = SUGGESTION: đề xuất được nhận. */
    String suggestionId;
    /** Khi source = SUGGESTION: tên người đề xuất; null nếu đề xuất của hệ thống. */
    String suggestionAuthorName;
}
