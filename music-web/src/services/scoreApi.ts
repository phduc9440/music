import apiClient from './client';
import type {
  ApiResponse,
  PageResult,
  ScoreDetail,
  ScoreFileInfo,
  ScoreListParams,
  ScoreSaveResult,
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

/**
 * MusicXML hiện hành kèm version lấy từ ETag ("v5" -> 5). Version đi cùng đúng nội dung vừa tải nên dùng cho If-Match khi
 * lưu, không bị lệch nếu có người lưu giữa hai lần gọi API. version = null nếu không đọc được ETag.
 */
export const fetchMusicXmlWithVersion = async (scoreId: string): Promise<{ xml: string; version: number | null }> => {
  const response = await apiClient.get<string>(`/scores/${scoreId}/musicxml`, {
    responseType: 'text',
    transformResponse: (data) => data, // giữ nguyên chuỗi XML, không để axios thử parse JSON
  });
  const match = /v(\d+)/.exec(String(response.headers?.etag ?? ''));
  return { xml: response.data, version: match ? Number(match[1]) : null };
};

/** Chuỗi MusicXML hiện hành của bản nhạc (application/vnd.recordare.musicxml+xml). */
export const fetchMusicXml = async (scoreId: string): Promise<string> => (await fetchMusicXmlWithVersion(scoreId)).xml;

/**
 * Lưu MusicXML đã chỉnh sửa (PUT /scores/{id}/musicxml, đặc tả 3.6).
 * @param scoreId id bản nhạc
 * @param xml nội dung MusicXML
 * @param version phiên bản web đang giữ, gửi qua If-Match; lệch với BE thì lỗi 2014 (409)
 * @param force true để ghi đè dù lệch phiên bản (chỉ chủ sở hữu/ADMIN)
 */
export const saveMusicXml = async (
  scoreId: string,
  xml: string,
  version: number,
  force = false,
): Promise<ScoreSaveResult> => {
  const response = await apiClient.put<ApiResponse<ScoreSaveResult>>(`/scores/${scoreId}/musicxml`, xml, {
    headers: { 'Content-Type': 'application/vnd.recordare.musicxml+xml', 'If-Match': `"v${version}"` },
    params: force ? { force: true } : undefined,
    timeout: 60000,
  });
  return response.data.result;
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
