import apiClient from './client';
import type {
  AdminDashboard,
  AdminMemberDetail,
  AdminTag,
  AdminUpdateMemberRequest,
  ApiResponse,
  ErrorLogEntry,
  Member,
  PageResult,
  ScoreDetail,
  ScoreSummary,
  SystemMetrics,
} from '../types';

/** Khớp AdminMemberController của BE (/api/admin/members). Chỉ ROLE_ADMIN gọi được. page bắt đầu từ 0. */
export const adminApi = {
  getMembers: (params?: { page?: number; size?: number; keyword?: string }) =>
    apiClient.get<ApiResponse<PageResult<Member>>>('/admin/members', {
      params: { page: 0, size: 20, ...params },
    }),
  getMember: (id: string) => apiClient.get<ApiResponse<Member>>(`/admin/members/${id}`),
  getMemberDetail: (id: string) => apiClient.get<ApiResponse<AdminMemberDetail>>(`/admin/members/${id}/detail`),
  updateMember: (id: string, data: AdminUpdateMemberRequest) =>
    apiClient.patch<ApiResponse<Member>>(`/admin/members/${id}`, data),
  getDashboard: (days = 30) =>
    apiClient.get<ApiResponse<AdminDashboard>>('/admin/dashboard', { params: { days } }),
  // Quản lý toàn bộ bản nhạc (xóa dùng scoreApi.remove)
  getScores: (params?: { page?: number; size?: number; keyword?: string; visibility?: string }) =>
    apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/admin/scores', { params: { page: 0, size: 20, ...params } }),
  setScoreVisibility: (id: string, visibility: 'PUBLIC' | 'PRIVATE', reason?: string) =>
    apiClient.put<ApiResponse<ScoreDetail>>(`/admin/scores/${id}/visibility`, { visibility, reason }),
  // 4.6: quản lý thể loại (tag) master data
  getTags: () => apiClient.get<ApiResponse<AdminTag[]>>('/admin/tags'),
  createTag: (name: string) => apiClient.post<ApiResponse<AdminTag>>('/admin/tags', { name }),
  updateTag: (id: string, name: string) => apiClient.put<ApiResponse<AdminTag>>(`/admin/tags/${id}`, { name }),
  deleteTag: (id: string) => apiClient.delete<ApiResponse<void>>(`/admin/tags/${id}`),
  // 4.8: giám sát hệ thống
  getMetrics: () => apiClient.get<ApiResponse<SystemMetrics>>('/admin/system/metrics'),
  getErrorLogs: (limit?: number) =>
    apiClient.get<ApiResponse<ErrorLogEntry[]>>('/admin/system/error-logs', { params: { limit } }),
  clearErrorLogs: () => apiClient.delete<ApiResponse<void>>('/admin/system/error-logs'),
};
