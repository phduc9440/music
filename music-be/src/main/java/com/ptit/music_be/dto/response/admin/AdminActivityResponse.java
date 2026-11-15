package com.ptit.music_be.dto.response.admin;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một dòng của trang "Nhật ký": suy ra từ bảng gốc (báo cáo, bản nhạc, góp ý, nhóm, chế tài gói), không lưu riêng. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminActivityResponse {
    /** Mã ổn định để làm key danh sách, dạng "loại:mã dòng gốc". */
    String id;
    /** REPORT_CREATED, REPORT_RESOLVED, SCORE_DELETED_BY_ADMIN, COMMENT_HIDDEN, TEAM_DELETED_BY_ADMIN, PLAN_SANCTION. */
    String type;
    LocalDateTime occurredAt;
    String actorId;
    String actorEmail;
    String targetType;
    String targetId;
    String targetLabel;
    /** Lý do / ghi chú / loại chế tài lấy từ dòng gốc; null nếu không có. */
    String detail;
}
