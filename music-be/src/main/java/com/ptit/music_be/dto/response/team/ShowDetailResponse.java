package com.ptit.music_be.dto.response.team;

import java.util.List;

import com.ptit.music_be.dto.enums.team.TeamRole;
import lombok.*;
import lombok.experimental.FieldDefaults;

/** Trang một show: thông tin show, các bài theo thứ tự diễn, vai trò của tôi, thành viên để phân công. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ShowDetailResponse {
    ShowResponse show;
    String teamName;
    TeamRole myRole;
    List<ShowItemResponse> items;
    /** Thành viên được giao việc (trừ VIEWER) để chọn người phối / người duyệt. */
    List<TeamMemberResponse> assignees;
}
