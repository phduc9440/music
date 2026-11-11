package com.ptit.music_be.service.admin;

import java.util.List;

import com.ptit.music_be.dto.request.UpdatePlanPriceRequest;
import com.ptit.music_be.dto.response.PlanResponse;

/** Quản lý giá gói ở khu quản trị: ADMIN xem, chỉ SUPER_ADMIN được sửa. */
public interface AdminPlanService {

    List<PlanResponse> list();

    /**
     * Đổi giá tháng/năm của gói {@code code}. Chỉ SUPER_ADMIN. Gói FREE phải giữ giá 0, gói trả phí phải lớn hơn 0. Đơn đã
     * tạo trước đó giữ nguyên số tiền cũ.
     */
    PlanResponse updatePrice(String code, UpdatePlanPriceRequest request);
}
