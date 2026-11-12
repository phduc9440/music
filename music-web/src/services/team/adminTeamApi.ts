import apiClient from '../client';
import type { AdminTeam, AdminTeamDetail, AdminTeamSummary, ApiResponse, PageResult } from '../../types';

/** Admin quản lý Team và Show (BE: AdminTeamController, /api/admin/teams). */
export const adminTeamApi = {
  summary: () => apiClient.get<ApiResponse<AdminTeamSummary>>('/admin/teams/summary'),
  search: (params?: { keyword?: string; deleted?: boolean; page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<AdminTeam>>>('/admin/teams', { params }),
  detail: (id: string) => apiClient.get<ApiResponse<AdminTeamDetail>>(`/admin/teams/${id}`),
  /** Xóa mềm; khôi phục được trong 30 ngày. */
  remove: (id: string, reason?: string) =>
    apiClient.delete<ApiResponse<void>>(`/admin/teams/${id}`, { params: { reason: reason || undefined } }),
  restore: (id: string) => apiClient.post<ApiResponse<void>>(`/admin/teams/${id}/restore`),
};
