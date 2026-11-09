import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

export const API_BASE_URL = 'http://localhost:8080/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Token nằm trong cookie HttpOnly do backend set; trình duyệt tự gửi kèm.
  withCredentials: true,
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
