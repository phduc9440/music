package com.ptit.music_be.exception.code;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.ErrorCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

/** Gói dịch vụ và thanh toán (37xx). */
@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum BillingErrorCode implements ErrorCode {
    // Gói dịch vụ và thanh toán 37xx
    PLAN_NOT_EXISTED(3701, "Gói dịch vụ không tồn tại", HttpStatus.NOT_FOUND),
    PLAN_LIMIT_REACHED(3702, "Bạn đã dùng hết hạn mức của gói hiện tại", HttpStatus.PAYMENT_REQUIRED),
    SUBSCRIPTION_MONTHS_INVALID(3703, "Số tháng cấp gói phải từ 1 đến 120", HttpStatus.BAD_REQUEST),
    PAYMENT_PROVIDER_UNAVAILABLE(3711, "Cổng thanh toán chưa được cấu hình", HttpStatus.SERVICE_UNAVAILABLE),
    PAYMENT_PLAN_NOT_PURCHASABLE(3712, "Gói này không thể mua", HttpStatus.BAD_REQUEST),
    PAYMENT_ORDER_NOT_EXISTED(3713, "Đơn thanh toán không tồn tại", HttpStatus.NOT_FOUND),
    PAYMENT_ORDER_NOT_REFUNDABLE(3714, "Chỉ hoàn tiền được đơn đã thanh toán", HttpStatus.CONFLICT),
    PAYMENT_PERIOD_INVALID(3715, "Chu kỳ thanh toán phải là MONTH hoặc YEAR", HttpStatus.BAD_REQUEST),
    PAYMENT_RANGE_INVALID(3716, "Khoảng ngày doanh thu không hợp lệ (tối đa 366 ngày)", HttpStatus.BAD_REQUEST),
    PAYMENT_ORDER_NOT_PAYABLE(3717, "Đơn này không còn chờ thanh toán", HttpStatus.CONFLICT),
    PAYMENT_NOT_NEEDED(3718, "Tài khoản quản trị đã có quyền lợi của gói này, không cần mua", HttpStatus.CONFLICT),
    PLAN_PRICE_INVALID(
            3719,
            "Giá không hợp lệ: gói Free phải là 0, gói trả phí từ 1 đến 1.000.000.000 đồng",
            HttpStatus.BAD_REQUEST),
    PLAN_NAME_INVALID(3720, "Tên gói không được trống và tối đa 100 ký tự", HttpStatus.BAD_REQUEST),
    PLAN_LIMITS_INVALID(
            3721,
            "Hạn mức không hợp lệ: mỗi số từ 0 đến 10.000.000 (để trống = không giới hạn), task cùng lúc ít nhất 1",
            HttpStatus.BAD_REQUEST),
    PLAN_CODE_INVALID(3722, "Mã gói gồm 2-16 ký tự: chữ in hoa, số, dấu gạch dưới", HttpStatus.BAD_REQUEST),
    PLAN_CODE_EXISTED(3723, "Mã gói đã tồn tại", HttpStatus.CONFLICT),
    PLAN_AUDIENCE_INVALID(3724, "Loại gói phải là Cá nhân (PERSONAL) hoặc Nhóm (TEAM)", HttpStatus.BAD_REQUEST),
    PLAN_SYSTEM_LOCKED(
            3725,
            "Không xóa được gói Free và Pro (hệ thống dùng cho người dùng mới và quản trị viên)",
            HttpStatus.CONFLICT),
    PLAN_NOT_GRANTABLE(3727, "Không cấp hàng loạt gói Free được; muốn bỏ gói thì dùng Hủy gói", HttpStatus.BAD_REQUEST),
    PLAN_SANCTION_INVALID(3728, "Thời hạn cấm phải từ 1 đến 120 tháng, lý do tối đa 255 ký tự", HttpStatus.BAD_REQUEST),
    PLAN_BANNED(3729, "Bạn đang bị cấm dùng gói này; vẫn có thể dùng Free hoặc mua gói khác", HttpStatus.FORBIDDEN),
    PLAN_IN_USE(3726, "Gói đã có người đăng ký hoặc có đơn thanh toán nên không xóa được", HttpStatus.CONFLICT),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    BillingErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
