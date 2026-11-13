package com.ptit.music_be.dto.response.score;

import java.time.LocalDateTime;
import java.util.List;

import com.ptit.music_be.dto.enums.score.SuggestionSource;
import com.ptit.music_be.dto.enums.score.SuggestionStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Chi tiết một đề xuất sửa: các trường của {@link SuggestionSummaryResponse} cùng danh sách ô và quyền của người xem. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class SuggestionDetailResponse {
    String id;
    String title;
    SuggestionStatus status;
    boolean structural;
    boolean stale;
    int changeCount;
    CommentMemberResponse author;
    LocalDateTime createdAt;
    LocalDateTime decidedAt;

    String scoreId;
    String scoreTitle;
    String description;
    SuggestionSource source;
    int baseVersion;
    /** Version MusicXML hiện hành của bản nhạc. */
    int currentVersion;
    /** VERSION_CHANGED, STRUCTURE_CHANGED hoặc CONTEXT_CHANGED khi {@code stale}; ngược lại null. */
    String staleReason;

    List<SuggestionChangeResponse> changes;
    CommentMemberResponse decidedBy;
    String decisionNote;
    /** Version tạo ra khi nhận. */
    Integer appliedVersion;
    /** Người xem nhận/từ chối được (có quyền sửa và đề xuất còn mở). */
    boolean canDecide;
    /** Người xem rút lại được (là người đề xuất và đề xuất còn mở). */
    boolean canWithdraw;
}
