import apiClient from '../client';
import type { ApiResponse, Member } from '../../types';

export interface UpdateProfilePayload {
  fullName: string;
  phone?: string;
  address?: string;
}

export const userApi = {
  // Mời bạn (7.5): mã giới thiệu của tôi (sinh lần đầu) và số người đã mời
  referral: () =>
    apiClient.get<ApiResponse<{ code: string; invitedCount: number; rewardedCount: number }>>('/referrals/me'),
  getMe: () => apiClient.get<ApiResponse<Member>>('/users/me'),
  updateMe: (data: UpdateProfilePayload) => apiClient.put<ApiResponse<Member>>('/users/me', data),
  // Lưu giao diện sáng/tối/theo hệ thống để đồng bộ giữa các máy
  updateTheme: (theme: 'LIGHT' | 'DARK' | 'SYSTEM') => apiClient.put<ApiResponse<Member>>('/users/me/theme', { theme }),
  updateLocale: (locale: 'VI' | 'EN') => apiClient.put<ApiResponse<Member>>('/users/me/locale', { locale }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post<ApiResponse<Member>>('/users/me/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteAvatar: () => apiClient.delete<ApiResponse<Member>>('/users/me/avatar'),
};
