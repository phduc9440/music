import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, AuthResponse } from '../types';

export const API_BASE_URL = 'http://localhost:8080/api';

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

let refreshPromise: Promise<string> | null = null;

const forceLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('role');
  window.location.href = '/auth/login';
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        original._retried = true;
        try {
          // Share one refresh call between concurrent 401s.
          refreshPromise ??= axios
            .post<ApiResponse<AuthResponse>>(`${API_BASE_URL}/auth/refresh`, { refreshToken })
            .then((res) => {
              const { token, refreshToken: newRefresh } = res.data.result;
              localStorage.setItem('token', token);
              if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
              return token;
            })
            .finally(() => {
              refreshPromise = null;
            });
          const token = await refreshPromise;
          original.headers.Authorization = `Bearer ${token}`;
          return apiClient(original);
        } catch {
          // fall through to logout
        }
      }
    }

    if (error.response?.status === 401 && !isAuthCall) {
      forceLogout();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
