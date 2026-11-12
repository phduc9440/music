import apiClient from '../client';
import type { AdminTeam, AdminTeamDetail, AdminTeamSummary, ApiResponse, PageResult } from '../../types';

/** Admin quản lý Team và Show (BE: AdminTeamController, /api/admin/teams). */
export const adminTeamApi = {
  summary: () => apiClient.get<ApiResponse<AdminTeamSummary>>('/admin/teams/summary'),
  search: (params?: { keyword?: string; page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<AdminTeam>>>('/admin/teams', { params }),
  detail: (id: string) => apiClient.get<ApiResponse<AdminTeamDetail>>(`/admin/teams/${id}`),
  remove: (id: string, reason?: string) =>
    apiClient.delete<ApiResponse<void>>(`/admin/teams/${id}`, { params: { reason: reason || undefined } }),
};
