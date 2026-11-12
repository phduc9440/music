package com.ptit.music_be.dto.response.score;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Bảng Góp ý của một bản nhạc: các góp ý theo bộ lọc và số đếm cho từng bộ lọc (tính ngay từ bảng, không lưu). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreCommentsResponse {
    /** Người đang xem viết được góp ý không (cần quyền nhận xét trở lên và bản nhạc đã có ô nhịp). */
    boolean canComment;
    /** Số ô hiện tại (giới hạn khi chọn vùng); null nếu bản nhạc chưa có MusicXML. */
    Integer measureCount;
    Integer currentVersion;
    long openCount;
    long resolvedCount;
    /** Số góp ý gốc có nhắc tới người đang xem. */
    long mentionedCount;
    List<ScoreCommentResponse> comments;
}
