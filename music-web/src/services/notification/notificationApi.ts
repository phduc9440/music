import apiClient from './client';
import type { ApiResponse, AppNotification, PageResult } from '../types';

export const notificationApi = {
  list: (params?: { page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<AppNotification>>>('/notifications', { params }),
  unreadCount: () => apiClient.get<ApiResponse<number>>('/notifications/unread-count'),
  markRead: (id: string) => apiClient.post<ApiResponse<void>>(`/notifications/${id}/read`),
  markAllRead: () => apiClient.post<ApiResponse<void>>('/notifications/read-all'),
};
