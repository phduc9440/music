import apiClient from './client';
import type { ApiResponse, PageResult, PracticeHeatmapDay, PracticePeriod, PracticeSessionRecord, PracticeStreak, PracticeTimeBucket } from '../types';

export const practiceApi = {
  list: (params?: { scoreId?: string; page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<PracticeSessionRecord>>>('/practice-sessions', { params }),
  get: (id: string) => apiClient.get<ApiResponse<PracticeSessionRecord>>(`/practice-sessions/${id}`),
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/practice-sessions/${id}`),
};

export const practiceStatsApi = {
  heatmap: (params?: { from?: string; to?: string }) =>
    apiClient.get<ApiResponse<PracticeHeatmapDay[]>>('/practice-stats/heatmap', { params }),
  time: (period: PracticePeriod, count?: number) =>
    apiClient.get<ApiResponse<PracticeTimeBucket[]>>('/practice-stats/time', { params: { period, count } }),
  streak: () => apiClient.get<ApiResponse<PracticeStreak>>('/practice-stats/streak'),
};
