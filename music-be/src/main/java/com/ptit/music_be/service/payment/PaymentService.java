package com.ptit.music_be.service.payment;

import java.util.List;
import java.util.Map;

import com.ptit.music_be.dto.enums.PaymentProviderType;
import com.ptit.music_be.dto.request.CreatePaymentOrderRequest;
import com.ptit.music_be.dto.response.PaymentOrderResponse;

public interface PaymentService {

    /** Kết quả xử lý một thông báo IPN, để controller đổi sang mã phản hồi đúng định dạng của từng cổng. */
    enum IpnResult {
        OK,
        INVALID_SIGNATURE,
        ORDER_NOT_FOUND,
        INVALID_AMOUNT,
        ALREADY_CONFIRMED
    }

    /** Tạo đơn PENDING (hết hạn sau 15 phút) và trả địa chỉ thanh toán của cổng. */
    PaymentOrderResponse createOrder(CreatePaymentOrderRequest request, String clientIp);

    /** Trạng thái đơn của chính người đang đăng nhập (trang kết quả chỉ hỏi và hiển thị, không kích hoạt gì). */
    PaymentOrderResponse getMyOrder(String orderCode);

    /**
     * Xử lý thông báo từ cổng: kiểm chữ ký, mã đơn, số tiền, trạng thái đơn, rồi trong một transaction đổi đơn thành
     * PAID và bật/gia hạn gói. Gọi lại nhiều lần chỉ kích hoạt một lần.
     */
    IpnResult handleIpn(PaymentProviderType provider, Map<String, String> params);

    /**
     * Trang kết quả gửi lại các tham số cổng đưa người dùng về. Chỉ tin khi chữ ký đúng (cùng cách kiểm như IPN), nhờ
     * vậy gói vẫn bật được khi IPN không tới máy chủ (ví dụ chạy ở localhost). Trả trạng thái đơn của chính người dùng.
     */
    PaymentOrderResponse confirmReturn(PaymentProviderType provider, Map<String, String> params);

    /** Lấy lại link thanh toán cho đơn PENDING còn hạn của chính người dùng (bấm "Thanh toán tiếp" trong lịch sử). */
    PaymentOrderResponse resumeOrder(String orderCode, String clientIp);

    /** Lịch sử đơn mua gói của người đang đăng nhập, mới nhất trước. */
    List<PaymentOrderResponse> listMyOrders();

    /** Chuyển các đơn PENDING đã quá hạn sang EXPIRED; trả số đơn đã chuyển. */
    int expirePending();
}
