import apiClient from '../client';
import type {
  PageResult,
  StudioEventBatchResponse,
  StudioNoteEvent,
  StudioSessionCreateRequest,
  StudioSessionFinishRequest,
  StudioSessionReport,
  StudioSessionResponse,
  StudioSessionSummary,
  StudioTimeline,
} from '../../types';

export const studioApi = {
  timeline: (scoreId: string) => apiClient.get<StudioTimeline>(`/studio/scores/${scoreId}/timeline`),
  create: (request: StudioSessionCreateRequest) => apiClient.post<StudioSessionResponse>('/studio/sessions', request),
  events: (sessionId: string, events: StudioNoteEvent[]) =>
    apiClient.post<StudioEventBatchResponse>(`/studio/sessions/${sessionId}/events`, { events }),
  abort: (sessionId: string) => apiClient.post<void>(`/studio/sessions/${sessionId}/abort`),
  list: (params?: { scoreId?: string; mode?: 'WAIT' | 'FREE_RUN'; page?: number; size?: number }) =>
    apiClient.get<PageResult<StudioSessionSummary>>('/studio/sessions', { params }),
  report: (sessionId: string) => apiClient.get<StudioSessionReport>(`/studio/sessions/${sessionId}/report`),
  best: (scoreId: string) => apiClient.get<StudioSessionReport>(`/studio/scores/${scoreId}/best`),
  finish: (sessionId: string, request: StudioSessionFinishRequest) =>
    apiClient.post<StudioSessionReport>(`/studio/sessions/${sessionId}/finish`, request),
};
