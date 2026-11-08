import apiClient from './client';
import type { AdminUpdateMemberRequest, ApiResponse, Member, PageResult } from '../types';

/** Khớp AdminMemberController của BE (/api/admin/members). Chỉ ROLE_ADMIN gọi được. page bắt đầu từ 0. */
export const adminApi = {
  getMembers: (params?: { page?: number; size?: number; keyword?: string }) =>
    apiClient.get<ApiResponse<PageResult<Member>>>('/admin/members', {
      params: { page: 0, size: 20, ...params },
    }),
  getMember: (id: string) => apiClient.get<ApiResponse<Member>>(`/admin/members/${id}`),
  updateMember: (id: string, data: AdminUpdateMemberRequest) =>
    apiClient.patch<ApiResponse<Member>>(`/admin/members/${id}`, data),
};
