package com.ptit.music_be.service.admin;

import com.ptit.music_be.dto.response.AdminTeamDetailResponse;
import com.ptit.music_be.dto.response.AdminTeamResponse;
import com.ptit.music_be.dto.response.AdminTeamSummaryResponse;
import com.ptit.music_be.dto.response.PageResponse;

/** Admin quản lý Team và Show (mục 4.1): xem danh sách, chi tiết, số liệu tổng quan; xóa team vi phạm. */
public interface AdminTeamService {

    AdminTeamSummaryResponse summary();

    /** Tìm theo tên team hoặc tên / email người tạo; mới tạo trước. */
    PageResponse<AdminTeamResponse> search(String keyword, int page, int size);

    AdminTeamDetailResponse detail(String teamId);

    /** Xóa team (vi phạm); báo cho mọi thành viên kèm lý do. Bản nhạc của team trở về bản cá nhân của chủ từng bản. */
    void delete(String teamId, String reason);
}
