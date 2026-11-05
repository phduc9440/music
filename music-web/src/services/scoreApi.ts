import apiClient from './client';
import type {
  ApiResponse,
  PageResult,
  ScoreDetail,
  ScoreFileInfo,
  ScoreListParams,
  ScoreSummary,
  ScoreUpdateRequest,
} from '../types';

export const scoreApi = {
  list: (params?: ScoreListParams) => apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/me', { params }),
  sharedWithMe: (params?: { page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/shared-with-me', { params }),
  detail: (id: string) => apiClient.get<ApiResponse<ScoreDetail>>(`/scores/${id}`),
  update: (id: string, data: ScoreUpdateRequest) => apiClient.patch<ApiResponse<ScoreDetail>>(`/scores/${id}`, data),
  // Thay toàn bộ thể loại của bản nhạc (tối đa 10, mảng rỗng = gỡ hết)
  updateTags: (id: string, tagIds: string[]) =>
    apiClient.put<ApiResponse<ScoreDetail>>(`/scores/${id}/tags`, { tagIds }),
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/scores/${id}`),
  files: (id: string, type?: string) =>
    apiClient.get<ApiResponse<ScoreFileInfo[]>>(`/scores/${id}/files`, { params: type ? { type } : undefined }),
};
