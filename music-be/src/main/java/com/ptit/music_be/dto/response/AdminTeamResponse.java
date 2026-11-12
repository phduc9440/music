package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một dòng trong danh sách team của admin: người tạo, số đếm, lần hoạt động gần nhất, gói của người tạo. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminTeamResponse {
    String id;
    String name;
    String description;
    String creatorId;
    String creatorName;
    String creatorEmail;
    long memberCount;
    long scoreCount;
    long showCount;
    long preparingShows;
    LocalDateTime createdAt;
    /** Lần ghi nhật ký hoạt động gần nhất; null nếu chưa có. */
    LocalDateTime lastActivityAt;
    /** Gói của người tạo còn quyền lợi team. */
    boolean planActive;
    /** Số thành viên tối đa theo gói của người tạo; null = không giới hạn. */
    Integer memberLimit;
}
