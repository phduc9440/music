package com.ptit.music_be.service.admin;

import com.ptit.music_be.dto.response.admin.AdminTeamDetailResponse;
import com.ptit.music_be.dto.response.admin.AdminTeamResponse;
import com.ptit.music_be.dto.response.admin.AdminTeamSummaryResponse;
import com.ptit.music_be.dto.response.common.PageResponse;

/** Admin quản lý Team và Show (mục 4.1): xem danh sách, chi tiết, số liệu tổng quan; xóa team vi phạm. */
public interface AdminTeamService {

    AdminTeamSummaryResponse summary();

    /**
     * Tìm theo tên team hoặc tên / email người tạo. {@code deleted} false = team đang hoạt động (mới tạo trước), true = team đã
     * xóa mềm (mới xóa trước), kể cả team quá hạn khôi phục.
     */
    PageResponse<AdminTeamResponse> search(String keyword, boolean deleted, int page, int size);

    AdminTeamDetailResponse detail(String teamId);

    /** Xóa mềm team (vi phạm); báo cho mọi thành viên kèm lý do. Khôi phục được trong 30 ngày, dữ liệu giữ nguyên. */
    void delete(String teamId, String reason);

    /** Khôi phục team đã xóa mềm (dù do chủ team hay quản trị viên xóa) trong 30 ngày; báo cho thành viên. */
    void restore(String teamId);
}
