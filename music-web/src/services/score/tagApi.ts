import apiClient from '../client';
import type { ApiResponse, Tag } from '../../types';

export const tagApi = {
  // Toàn bộ thể loại, BE đã sắp xếp theo tên
  list: () => apiClient.get<ApiResponse<Tag[]>>('/tags'),
};
