package com.ptit.music_be.service.admin;

import java.time.LocalDateTime;
import java.util.List;

import com.ptit.music_be.dto.response.admin.AdminActivityResponse;
import com.ptit.music_be.dto.response.common.PageResponse;

/**
 * Trang "Nhật ký" của admin (R5). Giống thống kê: không có bảng nhật ký riêng, mỗi dòng được suy ra lúc đọc từ chính
 * bảng đã lưu sự việc đó (người làm + thời điểm nằm sẵn trong bảng gốc), nên không thể lệch với dữ liệu thật.
 */
public interface AdminActivityService {

    /** Các loại dòng có thể có, để làm bộ lọc. */
    List<String> types();

    /** Mới nhất trước; lọc theo email người làm (chứa), loại, loại đối tượng và khoảng thời gian [from, to). */
    PageResponse<AdminActivityResponse> search(
            int page,
            int size,
            String actor,
            String type,
            String targetType,
            LocalDateTime from,
            LocalDateTime to);
}
