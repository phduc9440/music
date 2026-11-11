import apiClient from '../client';
import type {
  ApiResponse,
  BillingPeriod,
  MySubscription,
  PageResult,
  PaymentOrder,
  PaymentStatus,
  PlanInfo,
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
  getOrder: (orderCode: string) => apiClient.get<ApiResponse<PaymentOrder>>(`/payments/orders/${orderCode}`),
  // Admin: doanh thu, danh sách đơn, hoàn tiền thủ công
  revenue: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<Revenue>>('/admin/payments/revenue', { params }),
  orders: (params?: { status?: PaymentStatus; page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<PaymentOrder>>>('/admin/payments/orders', { params }),
  refund: (id: string) => apiClient.post<ApiResponse<PaymentOrder>>(`/admin/payments/orders/${id}/refund`),
};
