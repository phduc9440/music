import apiClient from '../client';
import type {
  ApiResponse,
  CommentFilter,
  CommentMember,
  ScoreComment,
  ScoreCommentPayload,
  ScoreCommentUpdatePayload,
  ScoreComments,
} from '../../types';

/** Góp ý gắn vào ô nhịp (mục 4.2, BE: ScoreCommentController). Ghi xong trả về cả luồng góp ý để vẽ lại. */
export const commentApi = {
  list: (scoreId: string, filter: CommentFilter = 'ALL') =>
    apiClient.get<ApiResponse<ScoreComments>>(`/scores/${scoreId}/comments`, {
      params: filter === 'MENTIONED' ? { mentioned: true } : filter === 'ALL' ? undefined : { status: filter },
    }),
  create: (scoreId: string, data: ScoreCommentPayload) =>
    apiClient.post<ApiResponse<ScoreComment>>(`/scores/${scoreId}/comments`, data),
  /** Người @nhắc được (xem được bản nhạc), lọc theo tên hoặc đầu email. */
  mentionable: (scoreId: string, q?: string) =>
    apiClient.get<ApiResponse<CommentMember[]>>(`/scores/${scoreId}/comments/mentionable`, {
      params: q ? { q } : undefined,
    }),
  reply: (commentId: string, data: { content: string; mentionIds?: string[] }) =>
    apiClient.post<ApiResponse<ScoreComment>>(`/comments/${commentId}/replies`, data),
  update: (commentId: string, data: ScoreCommentUpdatePayload) =>
    apiClient.patch<ApiResponse<ScoreComment>>(`/comments/${commentId}`, data),
  remove: (commentId: string) => apiClient.delete<ApiResponse<void>>(`/comments/${commentId}`),
};
