package com.ptit.music_be.dto.response.admin;

import java.time.LocalDate;
import java.util.List;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Số liệu tổng quan cho trang dashboard của admin. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AdminDashboardResponse {

    /** Số ngày của các biểu đồ theo ngày. */
    int days;

    Totals totals;
    /** Bản nhạc tạo mới mỗi ngày (đủ days ngày, ngày không có là 0). */
    List<DayCount> scoresByDay;
    /**
     * Thành viên đăng ký mới mỗi ngày. Chỉ tính tài khoản có ngày đăng ký (tài khoản tạo trước khi có cột này không
     * có, xem membersWithoutDate).
     */
    List<DayCount> membersByDay;
    /** Số tài khoản chưa có ngày đăng ký (không nằm trong biểu đồ trên). */
    long membersWithoutDate;
    /** Luyện tập mỗi ngày: số phiên và số phút. */
    List<DayPractice> practiceByDay;

    List<KeyCount> scoresByVisibility;
    List<KeyCount> scoresBySource;
    List<KeyCount> scoresByDifficulty;
    List<KeyCount> aiTasksByStatus;
    List<KeyCount> topTags;
    List<TopScore> topViewed;

    /** Gói dịch vụ và doanh thu; số tiền tính trong days ngày gần nhất, còn lại là trạng thái hiện tại. */
    Billing billing;
    /** Doanh thu mỗi ngày theo ngày thanh toán (chỉ đơn PAID, đủ days ngày). */
    List<DayRevenue> revenueByDay;
    /** Gói đang hiệu lực (ACTIVE, chưa hết hạn) theo tên gói, xếp theo thứ tự gói. */
    List<KeyCount> subscriptionsByPlan;
    /** Gói đang hiệu lực theo nguồn: PAYMENT / POINTS_TRIAL / ADMIN_GRANT. */
    List<KeyCount> subscriptionsBySource;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Totals {
        long members;
        long activeMembers;
        long lockedMembers;
        long admins;
        long scores;
        long publicScores;
        long pendingScores;
        long officialScores;
        long reviews;
        /** Điểm sao trung bình toàn hệ thống; null nếu chưa có nhận xét. */
        Double averageRating;

        long practiceSessions;
        long aiTasksRunning;
        long aiTasksFailed;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class Billing {
        /** Tổng tiền các đơn PAID có ngày thanh toán trong khoảng (VND). */
        long revenue;

        long paidOrders;
        /** Đơn đã hoàn tiền có ngày thanh toán trong khoảng (không tính vào revenue). */
        long refundedAmount;

        long refundedOrders;
        /** Số gói đang hiệu lực (một người có thể có cả gói cá nhân và gói nhóm). */
        long activeSubscriptions;
        /** Số thành viên đang có ít nhất một gói hiệu lực. */
        long subscribedMembers;
        /** Đơn đang chờ thanh toán, chưa quá hạn. */
        long pendingOrders;
        /** Lệnh cấm dùng gói đang có hiệu lực. */
        long activeBans;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class DayRevenue {
        LocalDate date;
        long amount;
        long orders;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class DayCount {
        LocalDate date;
        long count;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class DayPractice {
        LocalDate date;
        long sessions;
        double minutes;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class KeyCount {
        String key;
        long count;
    }

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @FieldDefaults(level = AccessLevel.PRIVATE)
    public static class TopScore {
        String id;
        String title;
        String ownerEmail;
        long viewCount;
    }
}
