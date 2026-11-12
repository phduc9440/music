package com.ptit.music_be.dto.response.admin;

import java.time.LocalDateTime;
import java.util.List;

import com.ptit.music_be.dto.response.team.ShowResponse;
import com.ptit.music_be.dto.response.team.TeamActivityResponse;
import com.ptit.music_be.dto.response.team.TeamMemberResponse;

import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * Chi tiết một team cho admin: thành viên, show và tiến độ, danh sách bản nhạc (chỉ tên và trạng thái hiển thị, admin không
 * được mở bản riêng tư), hoạt động gần đây.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminTeamDetailResponse {
    AdminTeamResponse team;
    List<TeamMemberResponse> members;
    List<ShowResponse> shows;
    List<TeamScoreRow> scores;
    List<TeamActivityResponse> recentActivities;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class TeamScoreRow {
        String id;
        String title;
        String ownerName;
        String visibility;
        LocalDateTime updatedAt;
    }
}
