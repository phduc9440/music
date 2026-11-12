package com.ptit.music_be.dto.response.admin;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Số liệu tổng quan về Team và Show cho admin, tính thẳng từ các bảng team (không lưu bảng thống kê). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminTeamSummaryResponse {
    long teams;
    /** Team có ít nhất một hoạt động trong 7 ngày qua. */
    long activeTeams7d;
    /** Số người đang ở trong ít nhất một team. */
    long teamMembers;
    long preparingShows;
    /** Bài chưa duyệt trong các show đang chuẩn bị. */
    long openItems;
    /** Bài chưa duyệt đã quá hạn trong các show đang chuẩn bị. */
    long overdueItems;
}
