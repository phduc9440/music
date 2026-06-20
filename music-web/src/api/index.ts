import axios, { InternalAxiosRequestConfig } from 'axios';
import { AuthResponse, User, ApiResponse, PageResponse } from '../types';

const API_BASE_URL = 'http://localhost:8080/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (data: any) => apiClient.post<ApiResponse<AuthResponse>>('/auth/login', data),
  register: (data: any) => apiClient.post<ApiResponse<User>>('/auth/register', data),
};

export const userApi = {
  getMe: () => apiClient.get<ApiResponse<User>>('/users/me'),
};

export const adminApi = {
  getMe: () => apiClient.get<ApiResponse<User>>('/admins/me'),
  getAccounts: (page = 1, size = 20) => apiClient.get<ApiResponse<PageResponse<User>>>(`/admins/accounts?page=${page}&size=${size}`),
  createAccount: (data: any) => apiClient.post<ApiResponse<User>>('/admins/accounts', data),
  updateAccount: (id: string, data: any) => apiClient.put<ApiResponse<User>>(`/admins/accounts/${id}`, data),
  deleteAccount: (id: string) => apiClient.delete<ApiResponse<void>>(`/admins/accounts/${id}`),
};

export default apiClient;
