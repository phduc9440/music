import apiClient from './client';
import type { ApiResponse, Member } from '../types';

export const userApi = {
  getMe: () => apiClient.get<ApiResponse<Member>>('/users/me'),
};
