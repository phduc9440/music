package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;
import java.util.List;

import com.ptit.music_be.dto.enums.CommentStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một góp ý (gốc kèm các trả lời, hoặc một trả lời) và những gì người đang xem được làm với nó. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreCommentResponse {
    String id;
    String scoreId;
    /** Null là góp ý gốc. */
    String parentId;
    CommentMemberResponse author;
    String content;
    List<CommentMemberResponse> mentions;
    LocalDateTime createdAt;
    /** Lần sửa nội dung gần nhất; null nếu chưa sửa. */
    LocalDateTime editedAt;

    // ---- chỉ góp ý gốc
    Integer startMeasure;
    Integer endMeasure;
    String partId;
    List<String> noteIds;
    /** Version MusicXML lúc viết. */
    Integer scoreVersion;
    /** Số ô của bản nhạc đã khác lúc viết (thêm/xóa ô): vị trí có thể đã lệch, giao diện hiện "Viết trên phiên bản vN". */
    boolean outdated;
    CommentStatus status;
    CommentMemberResponse resolvedBy;
    LocalDateTime resolvedAt;
    List<ScoreCommentResponse> replies;

    // ---- quyền của người đang xem
    boolean canEdit;
    boolean canDelete;
    /** Chỉ góp ý gốc: người viết, chủ bản nhạc hoặc người có quyền sửa. */
    boolean canResolve;
}
