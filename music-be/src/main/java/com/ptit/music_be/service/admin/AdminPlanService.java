package com.ptit.music_be.service.admin;

import java.util.List;

import com.ptit.music_be.dto.request.CreatePlanRequest;
import com.ptit.music_be.dto.request.UpdatePlanRequest;
import com.ptit.music_be.dto.response.PlanResponse;

/** Quản lý gói (tên, giá, hạn mức) ở khu quản trị: ADMIN xem, chỉ SUPER_ADMIN được sửa. */
public interface AdminPlanService {

    List<PlanResponse> list();

    /**
     * Sửa tên, giá tháng/năm và hạn mức của gói {@code code}. Chỉ SUPER_ADMIN. Gói FREE phải giữ giá 0, gói trả phí phải
     * lớn hơn 0. Đơn đã tạo trước đó giữ nguyên số tiền cũ; hạn mức mới áp dụng ngay cho mọi người đang dùng gói.
     */
    PlanResponse update(String code, UpdatePlanRequest request);

    /** Tạo gói mới. Chỉ SUPER_ADMIN. Mã gói duy nhất và không đổi được sau khi tạo. */
    PlanResponse create(CreatePlanRequest request);

    /**
     * Xóa gói. Chỉ SUPER_ADMIN. Không xóa được FREE, PRO (hệ thống dựa vào hai gói này) và gói đã từng có người đăng ký
     * hoặc có đơn thanh toán (giữ lịch sử doanh thu).
     */
    void delete(String code);
}
