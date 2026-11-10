import apiClient from './client';
import type { ApiResponse, HomeSummary, PublicHome } from '../types';

export const homeApi = {
  /** Trang chủ cho khách, không cần đăng nhập (BE nhớ 5 phút). */
  publicHome: () => apiClient.get<ApiResponse<PublicHome>>('/public/home'),
  /** Trang làm việc của người đã đăng nhập, gộp một lần gọi. */
  summary: () => apiClient.get<ApiResponse<HomeSummary>>('/home/summary'),
};
