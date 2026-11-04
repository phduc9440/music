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
  PageResult,
  ScoreSummary,
  ScoreDetail,
  ScoreFileInfo,
  ScoreListParams,
  ScoreUpdateRequest,
  OmrUploadRequest,
  OmrUploadResult,
  AiTaskInfo,
  OmrResult,
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

export const scoreApi = {
  list: (params?: ScoreListParams) => apiClient.get<ApiResponse<PageResult<ScoreSummary>>>('/scores/me', { params }),
  detail: (id: string) => apiClient.get<ApiResponse<ScoreDetail>>(`/scores/${id}`),
  update: (id: string, data: ScoreUpdateRequest) => apiClient.patch<ApiResponse<ScoreDetail>>(`/scores/${id}`, data),
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/scores/${id}`),
  files: (id: string, type?: string) =>
    apiClient.get<ApiResponse<ScoreFileInfo[]>>(`/scores/${id}/files`, { params: type ? { type } : undefined }),
};

/** Chuỗi kern đã ghép của bản nhạc (text/plain). */
export const fetchKern = async (scoreId: string): Promise<string> => {
  const response = await apiClient.get<string>(`/scores/${scoreId}/kern`, {
    responseType: 'text',
    transformResponse: (data) => data, // giữ nguyên chuỗi, không để axios thử parse JSON
  });
  return response.data;
};

export const omrApi = {
  // Upload 1 PDF hoặc 1–20 ảnh (đúng thứ tự trang) để tạo bản nhạc và tác vụ OMR
  upload: (data: OmrUploadRequest, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    data.files.forEach((f) => form.append('files', f));
    if (data.title.trim()) form.append('title', data.title.trim());
    if (data.composer.trim()) form.append('composer', data.composer.trim());
    form.append('sourceType', data.sourceType);
    return apiClient.post<ApiResponse<OmrUploadResult>>('/omr/upload', form, {
      // undefined để trình duyệt tự đặt multipart/form-data kèm boundary
      headers: { 'Content-Type': undefined },
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded * 100) / e.total)),
    });
  },
  // Chạy lại OMR trên file gốc đã lưu (lỗi 2201: đang có tác vụ chạy, 2202: quá 3 tác vụ)
  // preprocess bỏ trống: dùng lại lựa chọn của lần chạy trước
  retry: (scoreId: string, preprocess?: boolean) =>
    apiClient.post<ApiResponse<AiTaskInfo>>(
      `/scores/${scoreId}/omr/retry`,
      preprocess === undefined ? {} : { preprocess },
    ),
  // Kết quả nhận diện mới nhất: cảnh báo, ảnh từng trang, id file kern
  result: (scoreId: string) => apiClient.get<ApiResponse<OmrResult>>(`/scores/${scoreId}/omr/result`),
};

export const taskApi = {
  get: (taskId: string) => apiClient.get<ApiResponse<AiTaskInfo>>(`/ai-tasks/${taskId}`),
  // Mới nhất trước
  listOfScore: (scoreId: string) => apiClient.get<ApiResponse<AiTaskInfo[]>>(`/scores/${scoreId}/ai-tasks`),
  cancel: (taskId: string) => apiClient.post<ApiResponse<AiTaskInfo>>(`/ai-tasks/${taskId}/cancel`),
};

/**
 * Tải file dạng blob kèm token. Link tải của BE có dạng "/api/files/{id}/download" còn baseURL của axios
 * đã có sẵn "/api" nên phải bỏ tiền tố "/api".
 */
export const fetchFileBlob = async (downloadUrl: string): Promise<Blob> => {
  const path = downloadUrl.replace(/^\/api/, '');
  const response = await apiClient.get<Blob>(path, { responseType: 'blob' });
  return response.data;
};

/** Tải file về máy: lấy blob rồi kích hoạt thẻ <a download>. */
export const downloadFile = async (downloadUrl: string, fileName: string): Promise<void> => {
  const blob = await fetchFileBlob(downloadUrl);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
};

export default apiClient;
