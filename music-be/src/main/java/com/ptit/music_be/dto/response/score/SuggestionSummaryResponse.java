package com.ptit.music_be.dto.response.score;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.score.SuggestionSource;
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
    /** Nguồn đề xuất: người dùng sửa, hệ thống gợi ý hợp âm, hoặc phục hồi phiên cùng sửa. */
    SuggestionSource source;
    /** Phiên bản bản nhạc mà đề xuất dựa trên (gợi ý hợp âm chỉ nạp làm bản nháp khi trùng phiên bản hiện hành). */
    Integer baseVersion;
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
