import apiClient from '../client';
import type {
  ApiResponse,
  PageResult,
  SuggestionCreatePayload,
  SuggestionDecisionPayload,
  SuggestionDetail,
  SuggestionFilter,
  SuggestionSummary,
} from '../../types';

/** Đề xuất sửa theo ô nhịp (mục 4.3, BE: ScoreSuggestionController). */
export const suggestionApi = {
  /** Gửi bản đã sửa dưới dạng file MusicXML. Lỗi 3111: không có thay đổi, 3112/3117: vượt giới hạn. */
  create: (scoreId: string, data: SuggestionCreatePayload) => {
    const form = new FormData();
    const file = new Blob([data.musicXml], { type: 'application/vnd.recordare.musicxml+xml' });
    form.append('file', file, 'suggestion.musicxml');
    form.append('baseVersion', String(data.baseVersion));
    form.append('title', data.title);
    if (data.description) form.append('description', data.description);
    return apiClient.post<ApiResponse<SuggestionDetail>>(`/scores/${scoreId}/suggestions`, form, {
      // Để trình duyệt tự đặt boundary của multipart
      headers: { 'Content-Type': undefined },
      timeout: 60000,
    });
  },
  list: (scoreId: string, filter: SuggestionFilter = 'ALL', page = 0, size = 20) =>
    apiClient.get<ApiResponse<PageResult<SuggestionSummary>>>(`/scores/${scoreId}/suggestions`, {
      params: { status: filter, page, size },
    }),
  get: (id: string) => apiClient.get<ApiResponse<SuggestionDetail>>(`/suggestions/${id}`),
  /** MusicXML đầy đủ mà người đề xuất đã gửi (để xem trước). Lỗi 2002: file đã được dọn. */
  content: async (id: string): Promise<string> => {
    const response = await apiClient.get<string>(`/suggestions/${id}/content`, {
      responseType: 'text',
      transformResponse: (data) => data, // giữ nguyên chuỗi XML, không để axios thử parse JSON
    });
    return response.data;
  },
  /** Nhận các ô đã chọn (bỏ trống là tất cả). currentVersion gửi qua If-Match; lệch thì lỗi 2014 (409). */
  accept: (id: string, currentVersion: number, data?: SuggestionDecisionPayload) =>
    apiClient.post<ApiResponse<SuggestionDetail>>(`/suggestions/${id}/accept`, data ?? {}, {
      headers: { 'If-Match': `"v${currentVersion}"` },
      timeout: 60000,
    }),
  reject: (id: string, data?: SuggestionDecisionPayload) =>
    apiClient.post<ApiResponse<SuggestionDetail>>(`/suggestions/${id}/reject`, data ?? {}),
  withdraw: (id: string) => apiClient.delete<ApiResponse<void>>(`/suggestions/${id}`),
};
