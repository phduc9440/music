import apiClient from './client';
import type {
  AccountCreationRequest,
  AccountUpdateRequest,
  ApiResponse,
  PageRequest,
  PageResponse,
  Member,
} from '../types';

export const adminApi = {
  getMe: () => apiClient.get<ApiResponse<Member>>('/admins/me'),
  getAccounts: (params?: PageRequest) =>
    apiClient.get<ApiResponse<PageResponse<Member>>>('/admins/accounts', {
      params: { page: 1, size: 20, ...params },
    }),
  createAccount: (data: AccountCreationRequest) => apiClient.post<ApiResponse<Member>>('/admins/accounts', data),
  updateAccount: (id: string, data: AccountUpdateRequest) =>
    apiClient.put<ApiResponse<Member>>(`/admins/accounts/${id}`, data),
  deleteAccount: (id: string) => apiClient.delete<ApiResponse<void>>(`/admins/accounts/${id}`),
};
