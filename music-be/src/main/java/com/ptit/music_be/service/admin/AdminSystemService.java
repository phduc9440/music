package com.ptit.music_be.service.admin;

import java.util.List;

import com.ptit.music_be.dto.response.admin.ErrorLogResponse;
import com.ptit.music_be.dto.response.admin.SystemMetricsResponse;

public interface AdminSystemService {

    /** Thông số tải máy chủ hiện tại (heap, CPU, bộ nhớ, luồng, ổ đĩa, uptime). */
    SystemMetricsResponse getMetrics();

    /** Log lỗi gần nhất, mới nhất trước. limit mặc định 50, từ 1 đến 200. */
    List<ErrorLogResponse> getErrorLogs(Integer limit);

    /** Xóa các log lỗi đang giữ trong bộ nhớ. */
    void clearErrorLogs();
}
