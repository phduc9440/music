import apiClient from '../client';
import type {
  ApiResponse,
  BillingPeriod,
  MySubscription,
  PageResult,
  PaymentKind,
  PaymentOrder,
  PaymentStatus,
  PlanInfo,
  PlanLimits,
  Revenue,
} from '../../types';

export const billingApi = {
  plans: () => apiClient.get<ApiResponse<PlanInfo[]>>('/public/plans'),
  mine: () => apiClient.get<ApiResponse<MySubscription>>('/subscriptions/me'),
  // Admin: cấp gói thủ công N ngày / hủy gói hiện tại
  grant: (data: { memberId: string; planCode: string; days: number }) =>
    apiClient.post<ApiResponse<MySubscription>>('/admin/subscriptions', data),
  cancel: (memberId: string) => apiClient.delete<ApiResponse<void>>(`/admin/subscriptions/${memberId}`),
  // 7.4: tạo đơn (trả payUrl để chuyển sang cổng), hỏi trạng thái đơn của tôi
  createOrder: (data: { planCode: string; period: BillingPeriod }) =>
    apiClient.post<ApiResponse<PaymentOrder>>('/payments/orders', data),
  myOrders: () => apiClient.get<ApiResponse<PaymentOrder[]>>('/payments/orders'),
  // Lấy lại link thanh toán cho đơn PENDING còn hạn (nút "Thanh toán tiếp" ở lịch sử)
  resumeOrder: (orderCode: string) => apiClient.post<ApiResponse<PaymentOrder>>(`/payments/orders/${orderCode}/pay`),
  // Gửi nguyên các tham số vnp_* cổng đưa về; BE chỉ tin khi chữ ký đúng (bật gói khi IPN không tới được)
  confirmReturn: (params: Record<string, string>) =>
    apiClient.post<ApiResponse<PaymentOrder>>('/payments/vnpay/return', params),
  getOrder: (orderCode: string) => apiClient.get<ApiResponse<PaymentOrder>>(`/payments/orders/${orderCode}`),
  // Admin: tên, giá, hạn mức gói (mọi admin xem, chỉ SUPER_ADMIN sửa)
  adminPlans: () => apiClient.get<ApiResponse<PlanInfo[]>>('/admin/plans'),
  updatePlan: (code: string, data: { name: string; priceMonth: number; priceYear: number; limits: PlanLimits }) =>
    apiClient.put<ApiResponse<PlanInfo>>(`/admin/plans/${code}`, data),
  // Admin: doanh thu, danh sách đơn, hoàn tiền thủ công
  revenue: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<Revenue>>('/admin/payments/revenue', { params }),
  orders: (params?: { status?: PaymentStatus; kind?: PaymentKind; page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<PaymentOrder>>>('/admin/payments/orders', { params }),
  refund: (id: string) => apiClient.post<ApiResponse<PaymentOrder>>(`/admin/payments/orders/${id}/refund`),
};
