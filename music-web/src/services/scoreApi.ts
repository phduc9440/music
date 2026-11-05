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
  detail: (id: string) => apiClient.get<ApiResponse<ScoreDetail>>(`/scores/${id}`),
  update: (id: string, data: ScoreUpdateRequest) => apiClient.patch<ApiResponse<ScoreDetail>>(`/scores/${id}`, data),
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/scores/${id}`),
  files: (id: string, type?: string) =>
    apiClient.get<ApiResponse<ScoreFileInfo[]>>(`/scores/${id}/files`, { params: type ? { type } : undefined }),
};

/** Chuỗi kern đã ghép của bản nhạc (text/plain). */
export const fetchKern = async (scoreId: string): Promise<string> => {
  const response = await apiClient.get<string>(`/scores/${scoreId}/kern`, {
    responseType: 'text',
    transformResponse: (data) => data, // giữ nguyên chuỗi, không để axios thử parse JSON
  });
  return response.data;
};

/** Chuỗi MusicXML hiện hành của bản nhạc (application/vnd.recordare.musicxml+xml). */
export const fetchMusicXml = async (scoreId: string): Promise<string> => {
  const response = await apiClient.get<string>(`/scores/${scoreId}/musicxml`, {
    responseType: 'text',
    transformResponse: (data) => data, // giữ nguyên chuỗi XML, không để axios thử parse JSON
  });
  return response.data;
};

/**
 * Tải MusicXML hoặc MIDI của bản nhạc về máy. MIDI cũ hơn MusicXML thì BE tự tạo lại trước khi trả về
 * (có thể mất vài giây).
 */
export const downloadScoreExport = async (
  scoreId: string,
  kind: 'musicxml' | 'midi',
  fileName: string,
): Promise<void> => {
  const response = await apiClient.get<Blob>(`/scores/${scoreId}/${kind}`, { responseType: 'blob', timeout: 60000 });
  const objectUrl = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
};
