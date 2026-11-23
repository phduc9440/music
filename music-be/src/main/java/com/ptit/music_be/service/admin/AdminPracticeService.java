package com.ptit.music_be.service.admin;

import java.time.LocalDate;

import com.ptit.music_be.dto.response.admin.AdminPracticeSessionResponse;
import com.ptit.music_be.dto.response.common.PageResponse;

/** Quản trị luyện tập: xem buổi luyện của mọi thành viên, thống kê toàn hệ thống, xóa / đóng buổi bất thường. */
public interface AdminPracticeService {

    /** Mới nhất trước. keyword = email thành viên hoặc tên bản nhạc; mode, status theo tên enum. */
    PageResponse<AdminPracticeSessionResponse> list(
            int page,
            int size,
            String keyword,
            String mode,
            String status,
            boolean anomalousOnly,
            LocalDate from,
            LocalDate to);

    /** Thống kê trong khoảng ngày (mặc định 30 ngày gần nhất, tối đa 400 ngày). */
    AdminPracticeSessionResponse.Overview overview(LocalDate from, LocalDate to);

    /** Xóa hẳn một buổi luyện (cần PRACTICE_MANAGE). */
    void delete(String id);

    /** Đóng thủ công buổi đang chạy: chuyển sang ABANDONED (cần PRACTICE_MANAGE). */
    AdminPracticeSessionResponse close(String id);
}
