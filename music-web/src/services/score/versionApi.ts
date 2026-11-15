import apiClient from '../client';
import type { ApiResponse } from '../../types';
import type { ScoreSaveResult } from '../../types';
import type { ScoreDiff, ScoreVersion } from '../../types/version';

export const versionApi = {
  // Các phiên bản còn giữ (tối đa 20), mới nhất trước
  list: (scoreId: string) => apiClient.get<ApiResponse<ScoreVersion[]>>(`/scores/${scoreId}/versions`),

  // MusicXML của một phiên bản cũ (để xem trước). Lỗi 2801: phiên bản không còn
  content: async (scoreId: string, version: number): Promise<string> => {
    const response = await apiClient.get<string>(`/scores/${scoreId}/versions/${version}`, {
      responseType: 'text',
      transformResponse: (data) => data, // giữ nguyên chuỗi XML, không để axios thử parse JSON
    });
    return response.data;
  },

  // So một phiên bản với bản gốc (mặc định là bản do OMR sinh ra). Lỗi 2901: không có bản gốc, 2902: trùng version
  diff: async (scoreId: string, version: number, base?: number): Promise<ScoreDiff> => {
    const response = await apiClient.get<ApiResponse<ScoreDiff>>(`/scores/${scoreId}/versions/${version}/diff`, {
      params: base != null ? { base } : undefined,
      timeout: 60000,
    });
    return response.data.result;
  },

  // Khôi phục phiên bản cũ thành phiên bản mới nhất. currentVersion gửi qua If-Match; lệch thì lỗi 2014 (409)
  restore: async (scoreId: string, version: number, currentVersion: number): Promise<ScoreSaveResult> => {
    const response = await apiClient.post<ApiResponse<ScoreSaveResult>>(
      `/scores/${scoreId}/versions/${version}/restore`,
      undefined,
      { headers: { 'If-Match': `"v${currentVersion}"` }, timeout: 60000 },
    );
    return response.data.result;
  },
};
