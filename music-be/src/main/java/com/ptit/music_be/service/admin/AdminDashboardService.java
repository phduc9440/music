package com.ptit.music_be.service.admin;

import com.ptit.music_be.dto.response.admin.AdminDashboardResponse;

public interface AdminDashboardService {

    /** Số liệu dashboard; days (7-90, mặc định 30) là độ dài các biểu đồ theo ngày. */
    AdminDashboardResponse getDashboard(int days);
}
