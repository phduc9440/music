import apiClient from './client';
import type { ApiResponse, PageResult, PracticeSessionRecord } from '../types';

export const practiceApi = {
  list: (params?: { scoreId?: string; page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<PracticeSessionRecord>>>('/practice-sessions', { params }),
  get: (id: string) => apiClient.get<ApiResponse<PracticeSessionRecord>>(`/practice-sessions/${id}`),
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/practice-sessions/${id}`),
};
