package com.ptit.music_be.service.admin;

import java.time.LocalDate;

import com.ptit.music_be.dto.response.AdminAiTaskResponse;
import com.ptit.music_be.dto.response.PageResponse;

public interface AdminAiTaskService {

    /** Danh sách tác vụ AI (mới nhất trước), lọc theo trạng thái, loại, từ khóa (tên bản nhạc/email) và ngày tạo. */
    PageResponse<AdminAiTaskResponse> list(
            int page, int size, String status, String type, String keyword, LocalDate from, LocalDate to);

    AdminAiTaskResponse.Summary summary();

    /** Chi tiết một tác vụ, kèm dữ liệu vào/ra. */
    AdminAiTaskResponse detail(String taskId);

    /** Chạy lại một task OMR đã lỗi hoặc bị hủy (tạo task mới cho cùng bản nhạc). */
    AdminAiTaskResponse retry(String taskId);
}
