import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthResponse, User, ApiResponse, PageResponse } from '../types';

const API_BASE_URL = 'http://10.0.2.2:8080/api'; 

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      await AsyncStorage.removeItem('token');
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
