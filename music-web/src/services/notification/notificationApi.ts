import apiClient from '../client';
import type { ApiResponse, AppNotification, NotificationPreference, PageResult } from '../../types';

export const notificationApi = {
  list: (params?: { page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<AppNotification>>>('/notifications', { params }),
  unreadCount: () => apiClient.get<ApiResponse<number>>('/notifications/unread-count'),
  markRead: (id: string) => apiClient.post<ApiResponse<void>>(`/notifications/${id}/read`),
  preferences: () => apiClient.get<ApiResponse<NotificationPreference[]>>('/notifications/preferences'),
  updatePreferences: (items: NotificationPreference[]) =>
    apiClient.put<ApiResponse<NotificationPreference[]>>('/notifications/preferences', { items }),
  markAllRead: () => apiClient.post<ApiResponse<void>>('/notifications/read-all'),
};
