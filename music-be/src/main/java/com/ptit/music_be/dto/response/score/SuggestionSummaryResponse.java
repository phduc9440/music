package com.ptit.music_be.dto.response.score;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.score.SuggestionStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một dòng trong danh sách đề xuất sửa của bản nhạc (mục 4.3). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SuggestionSummaryResponse {
    String id;
    String title;
    SuggestionStatus status;
    /** Đổi cấu trúc (khung, khóa, nhịp): không chia theo ô, chỉ nhận tất cả. */
    boolean structural;
    /** Đề xuất còn mở nhưng bản chính đã đổi đến mức không áp dụng được. */
    boolean stale;

    int changeCount;
    /** Người đề xuất; null là hệ thống. */
    CommentMemberResponse author;

    LocalDateTime createdAt;
    LocalDateTime decidedAt;
}
