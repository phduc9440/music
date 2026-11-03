import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import type {
  AuthResponse,
  User,
  ApiResponse,
  PageResponse,
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from '../types';

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
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: (data: LoginRequest) => apiClient.post<ApiResponse<AuthResponse>>('/auth/login', data),
  googleLogin: (data: { idToken: string }) => apiClient.post<ApiResponse<AuthResponse>>('/auth/google-login', data),
  register: (data: RegisterRequest) => apiClient.post<ApiResponse<User>>('/auth/register', data),
  changePassword: (data: ChangePasswordRequest) => apiClient.post<ApiResponse<void>>('/auth/change-password', data),
  forgotPassword: (data: ForgotPasswordRequest) => apiClient.post<ApiResponse<void>>('/auth/forgot-password', data),
  resetPassword: (data: ResetPasswordRequest) => apiClient.post<ApiResponse<void>>('/auth/reset-password', data),
};

export const userApi = {
  getMe: () => apiClient.get<ApiResponse<User>>('/users/me'),
};

export const adminApi = {
  getMe: () => apiClient.get<ApiResponse<User>>('/admins/me'),
  getAccounts: (params?: import('../types').PageRequest) =>
    apiClient.get<ApiResponse<PageResponse<User>>>('/admins/accounts', {
      params: { page: 1, size: 20, ...params },
    }),
  createAccount: (data: import('../types').AccountCreationRequest) =>
    apiClient.post<ApiResponse<User>>('/admins/accounts', data),
  updateAccount: (id: string, data: import('../types').AccountUpdateRequest) =>
    apiClient.put<ApiResponse<User>>(`/admins/accounts/${id}`, data),
  deleteAccount: (id: string) => apiClient.delete<ApiResponse<void>>(`/admins/accounts/${id}`),
};

export default apiClient;
