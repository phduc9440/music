import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { getLocale } from '../i18n/core';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Token nằm trong cookie HttpOnly do backend set; trình duyệt tự gửi kèm.
  withCredentials: true,
});

// Cho backend biết ngôn ngữ đang dùng (email, thông báo về sau dựng theo header này)
apiClient.interceptors.request.use((config) => {
  config.headers.set('Accept-Language', getLocale());
  return config;
});

let refreshPromise: Promise<void> | null = null;

const forceLogout = () => {
  localStorage.removeItem('role');
  window.location.href = '/auth/login';
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        // Share one refresh call between concurrent 401s. Refresh token đi kèm cookie HttpOnly.
        refreshPromise ??= axios
          .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
          .then(() => undefined)
          .finally(() => {
            refreshPromise = null;
          });
        await refreshPromise;
        return apiClient(original);
      } catch {
        // fall through to logout
      }
    }

    if (error.response?.status === 401 && !isAuthCall) {
      forceLogout();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
