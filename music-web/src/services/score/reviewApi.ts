import apiClient from '../client';
import type { ApiResponse, ReviewList } from '../../types';

export const reviewApi = {
  list: (scoreId: string) => apiClient.get<ApiResponse<ReviewList>>(`/scores/${scoreId}/reviews`),
  // Tạo hoặc sửa nhận xét của tôi (cần số sao và/hoặc bình luận)
  saveMine: (scoreId: string, rating: number | null, comment: string) =>
    apiClient.put<ApiResponse<ReviewList>>(`/scores/${scoreId}/reviews/me`, { rating, comment }),
  remove: (scoreId: string, reviewId: string) =>
    apiClient.delete<ApiResponse<ReviewList>>(`/scores/${scoreId}/reviews/${reviewId}`),
};
