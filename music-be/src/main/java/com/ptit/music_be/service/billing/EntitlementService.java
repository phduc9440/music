package com.ptit.music_be.service.billing;

import com.ptit.music_be.dto.enums.billing.UsageMetric;

/**
 * Hỏi hạn mức theo gói của một thành viên. Số đã dùng không lưu bộ đếm riêng mà tính từ dữ liệu gốc mỗi lần hỏi (trang OMR =
 * tổng {@link #OMR_PAGES_CHARGED_KEY} của các task OMR trong tháng chưa lỗi/hủy).
 */
public interface EntitlementService {

    /** Khóa trong {@code ai_tasks.input_data}: số trang OMR tính vào hạn mức cho task đó (thiếu/0 = không tính). */
    String OMR_PAGES_CHARGED_KEY = "pagesCharged";

    PlanLimits limitsOf(String memberId);

    /**
     * Ném PLAN_LIMIT_REACHED (kèm {@code PlanLimitPayload}) nếu dùng thêm {@code amount} sẽ vượt hạn mức tháng này. Người
     * gọi phải khóa dòng thành viên trước rồi mới kiểm tra và ghi task, để hai yêu cầu song song không cùng lọt qua; chính
     * task vừa ghi (có {@code pagesCharged}) là "đã dùng".
     */
    void checkAvailable(String memberId, UsageMetric metric, int amount);

    /** Đã dùng trong tháng hiện tại (tính từ dữ liệu gốc). */
    int usedThisMonth(String memberId, UsageMetric metric);
}
