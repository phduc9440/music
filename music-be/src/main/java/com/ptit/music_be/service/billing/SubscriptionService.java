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

    /** Admin cấp gói thủ công (nguồn ADMIN_GRANT). */
    MySubscriptionResponse grant(String memberId, String planCode, int days);

    /** Admin hủy gói hiện tại của thành viên (về Free ngay). */
    void cancel(String memberId);

    /**
     * Nhắc gói sắp hết hạn: gửi thông báo cho gói còn 7 ngày và còn 1 ngày. Chạy mỗi ngày một lần nên mỗi gói rơi vào
     * mỗi khung đúng một lần; trả số thông báo đã gửi.
     */
    int remindExpiring();

    /** Chuyển các gói đã quá hạn sang EXPIRED; trả số gói đã chuyển. */
    int expireDue();
}
