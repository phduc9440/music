import apiClient from '../client';
import type { PageResult, StudioSessionFinishRequest, StudioSessionReport, StudioSessionSummary } from '../../types';

export const studioApi = {
  list: (params?: { scoreId?: string; mode?: 'WAIT' | 'FREE_RUN'; page?: number; size?: number }) =>
    apiClient.get<PageResult<StudioSessionSummary>>('/studio/sessions', { params }),
  report: (sessionId: string) => apiClient.get<StudioSessionReport>(`/studio/sessions/${sessionId}/report`),
  best: (scoreId: string) => apiClient.get<StudioSessionReport>(`/studio/scores/${scoreId}/best`),
  finish: (sessionId: string, request: StudioSessionFinishRequest) =>
    apiClient.post<StudioSessionReport>(`/studio/sessions/${sessionId}/finish`, request),
};
