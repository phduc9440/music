import apiClient from '../client';
import type { ApiResponse, BlankScoreRequest, BlankScoreResult } from '../../types';

export const scoreCreateApi = {
  // Tạo bản nhạc trống từ mẫu nhạc cụ, mở thẳng trình chỉnh sửa. Lỗi 3302: tùy chọn không hợp lệ, 2017: thiếu tiêu đề
  blank: (data: BlankScoreRequest) => apiClient.post<ApiResponse<BlankScoreResult>>('/scores/blank', data),
};
