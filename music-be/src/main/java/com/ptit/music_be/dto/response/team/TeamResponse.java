package com.ptit.music_be.dto.response.team;

import java.time.LocalDateTime;

import com.ptit.music_be.dto.enums.team.TeamRole;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một team kèm vai trò của người đang xem và vài số đếm. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class TeamResponse {
    String id;
    String name;
    String description;
    String avatarUrl;
    TeamRole myRole;
    long memberCount;
    long scoreCount;
    /** Số show đang chuẩn bị. */
    long preparingShows;
    String createdByName;
    LocalDateTime createdAt;
    /** Số thành viên tối đa theo gói của người tạo; null = không giới hạn. */
    Integer memberLimit;
    /** Gói của người tạo còn quyền lợi team (mời thêm được). */
    boolean planActive;
}
