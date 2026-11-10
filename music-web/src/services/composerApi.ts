import apiClient from './client';
import type { ApiResponse, Composer, ComposerPayload, ComposerPeriod, ExploreFacets } from '../types';

export const composerApi = {
  /** Danh sách công khai (không cần đăng nhập), nhiều bản công khai trước. */
  list: (params?: { keyword?: string; period?: ComposerPeriod | ''; limit?: number }) =>
    apiClient.get<ApiResponse<Composer[]>>('/public/composers', { params }),
  bySlug: (slug: string) => apiClient.get<ApiResponse<Composer>>(`/public/composers/${encodeURIComponent(slug)}`),
  /** Khóa nhạc có trong các bản công khai, cho bộ lọc Khám phá. */
  facets: () => apiClient.get<ApiResponse<ExploreFacets>>('/public/explore/facets'),
};

export const adminComposerApi = {
  list: () => apiClient.get<ApiResponse<Composer[]>>('/admin/composers'),
  create: (data: ComposerPayload) => apiClient.post<ApiResponse<Composer>>('/admin/composers', data),
  update: (id: string, data: ComposerPayload) => apiClient.put<ApiResponse<Composer>>(`/admin/composers/${id}`, data),
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/admin/composers/${id}`),
  /** Gắn lại toàn bộ bản nhạc theo tên tác giả; trả số bản đổi liên kết. */
  relink: () => apiClient.post<ApiResponse<number>>('/admin/composers/relink'),
};
