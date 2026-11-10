import apiClient from './client';
import { saveBlob, unwrapBlobError } from './fileApi';
import type {
  ApiResponse,
  Difficulty,
  PageResult,
  ScoreDetail,
  ScoreFileInfo,
  ScoreListParams,
  ScoreSaveResult,
  ScoreSummary,
  ScoreUpdateRequest,
  TrashedScore,
} from '../types';

export const scoreApi = {
  list: (params?: ScoreListParams) => apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/me', { params }),
  sharedWithMe: (params?: { page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/shared-with-me', { params }),
  // 4.5: kho score mẫu (mọi người dùng xem được), từ dễ đến khó
  official: (params?: { page?: number; size?: number; keyword?: string; difficulty?: Difficulty | '' }) =>
    apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/official', { params }),
  // Khám phá: bản nhạc đang công khai của mọi người
  explore: (params?: {
    page?: number;
    size?: number;
    keyword?: string;
    difficulty?: Difficulty | '';
    tagId?: string;
    sort?: 'NEWEST' | 'VIEWS' | 'RATING';
  }) => apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/public', { params }),
  // ADMIN: bản nhạc công khai chưa nằm trong kho, để chọn đưa vào
  officialCandidates: (params?: { page?: number; size?: number; keyword?: string }) =>
    apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/official/candidates', { params }),
  markOfficial: (id: string) => apiClient.put<ApiResponse<ScoreDetail>>(`/scores/${id}/official`),
  unmarkOfficial: (id: string) => apiClient.delete<ApiResponse<ScoreDetail>>(`/scores/${id}/official`),
  detail: (id: string) => apiClient.get<ApiResponse<ScoreDetail>>(`/scores/${id}`),
  update: (id: string, data: ScoreUpdateRequest) => apiClient.patch<ApiResponse<ScoreDetail>>(`/scores/${id}`, data),
  // Thay toàn bộ thể loại của bản nhạc (tối đa 10, mảng rỗng = gỡ hết)
  updateTags: (id: string, tagIds: string[]) =>
    apiClient.put<ApiResponse<ScoreDetail>>(`/scores/${id}/tags`, { tagIds }),
  // ADMIN: duyệt các bản nhạc chủ xin công khai
  pendingPublic: (params?: { page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/pending-public', { params }),
  approvePublic: (id: string) => apiClient.post<ApiResponse<ScoreDetail>>(`/scores/${id}/publish/approve`),
  rejectPublic: (id: string, reason?: string) =>
    apiClient.post<ApiResponse<ScoreDetail>>(`/scores/${id}/publish/reject`, { reason }),
  // Chuyển vào thùng rác (giữ 30 ngày); reason chỉ dành cho quản trị viên kiểm duyệt, gửi tới chủ sở hữu
  remove: (id: string, reason?: string) =>
    apiClient.delete<ApiResponse<void>>(`/scores/${id}`, { params: reason ? { reason } : undefined }),
  trash: (params?: { page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<TrashedScore>>>('/scores/trash', { params }),
  restore: (id: string) => apiClient.post<ApiResponse<void>>(`/scores/${id}/restore`),
  // Xóa hẳn một bản nhạc đang nằm trong thùng rác, không khôi phục được
  purge: (id: string) => apiClient.delete<ApiResponse<void>>(`/scores/${id}/purge`),
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
  try {
    const response = await apiClient.get<Blob>(`/scores/${scoreId}/${kind}`, { responseType: 'blob', timeout: 60000 });
    saveBlob(response.data, fileName);
  } catch (err) {
    throw await unwrapBlobError(err);
  }
};
