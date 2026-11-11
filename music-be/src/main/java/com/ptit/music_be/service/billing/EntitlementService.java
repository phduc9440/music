package com.ptit.music_be.service.billing;

import com.ptit.music_be.dto.enums.UsageMetric;

/** Hỏi hạn mức theo gói của một thành viên và trừ hạn mức theo tháng. */
public interface EntitlementService {

    PlanLimits limitsOf(String memberId);

    /**
     * Cộng {@code amount} vào bộ đếm tháng này nếu chưa vượt hạn mức, ngược lại ném PLAN_LIMIT_REACHED kèm
     * {@code PlanLimitPayload}. Chạy chung transaction với hành động của người gọi: hành động lỗi thì bộ đếm cũng
     * được hoàn lại theo.
     */
    void checkAndConsume(String memberId, UsageMetric metric, int amount);

    /** Trả lại hạn mức đã trừ (tác vụ lỗi/hủy). Tính vào đúng tháng đã trừ ({@code period} = yyyy-MM). */
    void release(String memberId, UsageMetric metric, int amount, String period);

    /** Đã dùng trong tháng hiện tại. */
    int usedThisMonth(String memberId, UsageMetric metric);
}
