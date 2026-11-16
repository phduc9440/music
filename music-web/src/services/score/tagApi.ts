import apiClient from '../client';
import type { ApiResponse, Tag } from '../../types';
import { isGuest } from '../../utils/session';

export const tagApi = {
  // Toàn bộ thể loại, BE đã sắp xếp theo tên
  /** Khách chưa đăng nhập dùng bản công khai (cho bộ lọc thể loại ở Khám phá). */
  list: () => apiClient.get<ApiResponse<Tag[]>>(isGuest() ? '/public/scores/tags' : '/tags'),
};
