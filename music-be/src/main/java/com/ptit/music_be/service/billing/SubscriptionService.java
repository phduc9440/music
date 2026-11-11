package com.ptit.music_be.service.billing;

import java.time.Period;
import java.util.List;

import com.ptit.music_be.dto.enums.SubscriptionSource;
import com.ptit.music_be.dto.response.MySubscriptionResponse;
import com.ptit.music_be.dto.response.PlanResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Plan;

public interface SubscriptionService {

    List<PlanResponse> listPlans();

    /** Gói và số đã dùng của người đang đăng nhập. */
    MySubscriptionResponse mine();

    /**
     * Gói đang dùng của nhiều thành viên một lần (cùng quy tắc với {@link #currentPlan}: SUPER_ADMIN không giới hạn, ADMIN
     * tối thiểu Pro). {@code rolesByMember}: id thành viên -> tên vai trò. Trả map id -> tóm tắt gói.
     */
    java.util.Map<String, com.ptit.music_be.dto.response.MemberPlanSummary> plansOf(
            java.util.Map<String, java.util.Set<String>> rolesByMember);

    /**
     * SUPER_ADMIN tạm ngưng quyền lợi gói Pro không thời hạn của một ADMIN: {@code months} = 0 là đến hết tháng này, 1..120
     * là số tháng tính theo lịch từ hôm nay. Hết hạn thì ADMIN tự dùng lại Pro. Gói đã mua/được cấp không bị ảnh hưởng.
     */
    com.ptit.music_be.dto.response.MySubscriptionResponse suspendRolePlan(String memberId, int months, String reason);

    /** SUPER_ADMIN mở lại sớm gói Pro theo vai trò của ADMIN (kết thúc mọi lần tạm ngưng đang hiệu lực). */
    com.ptit.music_be.dto.response.MySubscriptionResponse liftRolePlanSuspension(String memberId);

    /** Gói hiện tại của một thành viên bất kỳ (trang chi tiết thành viên ở khu quản trị). */
    MySubscriptionResponse ofMember(String memberId);

    /**
     * Gói đang hiệu lực của thành viên; không có thì gói FREE. SUPER_ADMIN nhận gói ảo UNLIMITED (mọi hạn mức không giới
     * hạn); ADMIN tối thiểu là gói PRO không thời hạn (gói đã mua cao hơn thì dùng gói đó).
     */
    Plan currentPlan(String memberId);

    /**
     * Bật hoặc gia hạn gói. Cùng gói đang hiệu lực thì cộng thêm thời gian vào ngày hết hạn; khác gói thì gói cũ bị
     * hủy ngay và gói mới tính từ bây giờ.
     */
    void activate(Member member, Plan plan, Period duration, SubscriptionSource source);

    /** Trừ bớt thời gian (hoàn tiền một đơn): hết hạn sau khi trừ thì hủy gói. Gói khác với {@code plan} thì bỏ qua. */
    void revoke(String memberId, Plan plan, Period duration);

    /** SUPER_ADMIN cấp gói cá nhân thủ công (nguồn ADMIN_GRANT). Gói team để sau (chờ tính năng Team). */
    /**
     * {@code months} tháng tính theo lịch: cùng gói đang dùng thì cộng nối tiếp từ ngày hết hạn hiện tại (gia hạn), gói khác
     * thì bắt đầu từ hôm nay và thay gói hiện tại.
     */
    MySubscriptionResponse grant(String memberId, String planCode, int months);

    /** SUPER_ADMIN hủy gói hiện tại của thành viên (về Free ngay). */
    void cancel(String memberId);

    /**
     * Nhắc gói sắp hết hạn: gửi thông báo cho gói còn 7 ngày và còn 1 ngày. Chạy mỗi ngày một lần nên mỗi gói rơi vào
     * mỗi khung đúng một lần; trả số thông báo đã gửi.
     */
    int remindExpiring();

    /** Chuyển các gói đã quá hạn sang EXPIRED; trả số gói đã chuyển. */
    int expireDue();
}
