package com.ptit.music_be.dto.enums.auth;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Quyền trong khu quản trị, gán cho vai trò tài khoản (bảng role_permissions, SUPER_ADMIN tích / bỏ tích ở trang "Vai
 * trò"). Danh sách quyền cố định trong code; vai trò là dữ liệu. SUPER_ADMIN luôn có mọi quyền; USER không có quyền quản
 * trị nào. Có ít nhất một quyền thì vào được khu quản trị (/api/admin/**), từng API kiểm tra quyền riêng.
 *
 * <p>Những việc không nằm ở đây là của riêng SUPER_ADMIN (không tích được, tránh tự nâng quyền): tạo / sửa / xóa vai trò,
 * tích quyền, gán vai trò cho thành viên, đụng tới tài khoản SUPER_ADMIN.
 *
 * <p>Thứ tự khai báo là thứ tự hàng trên bảng ở web; {@link #section} khớp nhóm menu quản trị.
 */
public enum AdminPermission {
    /** Bảng điều khiển: số liệu, biểu đồ. */
    DASHBOARD_VIEW("overview"),
    /** Xem danh sách, chi tiết thành viên (kèm gói đang dùng). */
    MEMBERS_VIEW("users"),
    /** Khóa / mở khóa tài khoản (trừ SUPER_ADMIN). */
    MEMBERS_LOCK("users"),
    /** Xem, xóa (vi phạm), khôi phục nhóm. */
    TEAMS_MANAGE("users"),
    /** Gửi thông báo tới thành viên. */
    ANNOUNCEMENTS_SEND("users"),
    /** Danh sách bản nhạc, đổi công khai, gỡ / xóa bản công khai vi phạm, thao tác hàng loạt, xóa nhận xét. */
    SCORES_MODERATE("content"),
    /** Hàng chờ duyệt công khai: duyệt, từ chối; xem bản đang chờ duyệt. */
    SCORES_APPROVE("content"),
    /** Kho bản nhạc mẫu: xin đưa vào kho, gỡ khỏi kho, sửa và xóa bản trong kho. */
    OFFICIAL_LIBRARY("content"),
    /** Thể loại. */
    TAGS_MANAGE("content"),
    /** Nhạc sĩ. */
    COMPOSERS_MANAGE("content"),
    /** Doanh thu, danh sách đơn thanh toán. */
    REVENUE_VIEW("billing"),
    /** Hoàn tiền đơn đã thanh toán. */
    PAYMENTS_REFUND("billing"),
    /** Cấp, hủy, cấm, bỏ cấm gói của thành viên. */
    SUBSCRIPTIONS_MANAGE("billing"),
    /** Tạo, sửa, xóa gói dịch vụ (giá, hạn mức). */
    PLANS_MANAGE("billing"),
    /** Tác vụ AI: xem, hủy, chạy lại task của mọi người. */
    AI_TASKS_MANAGE("system"),
    /** Giám sát hệ thống, nhật ký lỗi. */
    SYSTEM_MONITOR("system");

    private final String section;

    AdminPermission(String section) {
        this.section = section;
    }

    /** Nhóm của quyền (overview, users, content, billing, system), trùng nhóm menu quản trị ở web. */
    public String section() {
        return section;
    }

    /** Quyền phải có kèm khi bật quyền này (bật quyền này thì tự bật các quyền đó). */
    public List<AdminPermission> requires() {
        return switch (this) {
            case MEMBERS_LOCK, SUBSCRIPTIONS_MANAGE -> List.of(MEMBERS_VIEW);
            case PAYMENTS_REFUND -> List.of(REVENUE_VIEW);
            default -> List.of();
        };
    }

    /**
     * Quyền mặc định của vai trò ADMIN: đúng những việc quản trị viên thường làm được trước khi có bảng quyền (cấp gói, cấm
     * gói, sửa gói dịch vụ trước đây chỉ SUPER_ADMIN nên không có ở đây).
     */
    public static Set<AdminPermission> adminDefaults() {
        Set<AdminPermission> all = EnumSet.allOf(AdminPermission.class);
        all.removeAll(EnumSet.of(SUBSCRIPTIONS_MANAGE, PLANS_MANAGE));
        return all;
    }

    /** Thêm các quyền phải có kèm (đệ quy), để quyền lưu xuống luôn nhất quán. */
    public static Set<AdminPermission> withRequired(Set<AdminPermission> permissions) {
        Set<AdminPermission> result = EnumSet.noneOf(AdminPermission.class);
        List<AdminPermission> queue = new ArrayList<>(permissions);
        while (!queue.isEmpty()) {
            AdminPermission p = queue.remove(queue.size() - 1);
            if (p != null && result.add(p)) {
                queue.addAll(p.requires());
            }
        }
        return result;
    }
}
