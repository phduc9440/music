package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Một bản nhạc trong thùng rác. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TrashedScoreResponse {
    String id;
    String title;
    String composer;
    Integer measureCount;
    LocalDateTime deletedAt;
    /** Thời điểm bản nhạc bị xóa hẳn: deletedAt + số ngày lưu thùng rác. */
    LocalDateTime purgeAt;
    /** true nếu quản trị viên xóa (kiểm duyệt), false nếu chính chủ xóa. */
    boolean deletedByAdmin;
    /** Lý do quản trị viên nhập khi xóa, có thể null. */
    String deleteReason;
}
