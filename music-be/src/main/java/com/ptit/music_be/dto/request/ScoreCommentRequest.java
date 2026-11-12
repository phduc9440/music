package com.ptit.music_be.dto.request;

import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Viết góp ý gốc trên một vùng ô nhịp (mục 4.2). Kiểm tra ở service: nội dung 1–2000 ký tự, ô trong 1..số ô. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreCommentRequest {
    String content;
    Integer startMeasure;
    /** Bỏ trống thì bằng ô bắt đầu (góp ý một ô). */
    Integer endMeasure;
    /** Chỉ góp ý một bè (id part trong MusicXML); bỏ trống là mọi bè. */
    String partId;
    /** noteId đã chọn trong Editor (tùy chọn). */
    List<String> noteIds;
    /** Id thành viên được @nhắc (phải xem được bản nhạc). */
    List<String> mentionIds;
}
