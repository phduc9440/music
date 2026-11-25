import apiClient from '../client';
import type {
  AiTaskInfo,
  ApiResponse,
  OmrConfig,
  OmrResult,
  OmrRetryInfo,
  OmrSourceType,
  OmrUploadRequest,
  OmrUploadResult,
} from '../../types';

/** Tùy chọn khi nhận diện lại; bỏ trống trường nào thì dùng lại lựa chọn của lần chạy trước. */
export interface OmrRetryOptions {
  preprocess?: boolean;
  sourceType?: OmrSourceType;
}

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
  // Tùy chọn bỏ trống: dùng lại lựa chọn của lần chạy trước
  retry: (scoreId: string, options: OmrRetryOptions = {}) =>
    apiClient.post<ApiResponse<AiTaskInfo>>(`/scores/${scoreId}/omr/retry`, options),
  // Số trang sẽ trừ, lựa chọn lần trước, số phiên bản đã sửa sau lần số hóa gần nhất (hộp Nhận diện lại)
  retryInfo: (scoreId: string) => apiClient.get<ApiResponse<OmrRetryInfo>>(`/scores/${scoreId}/omr/retry-info`),
  // Giới hạn hệ thống cho một lần số hóa và cờ AI xác minh bên ngoài
  config: () => apiClient.get<ApiResponse<OmrConfig>>('/omr/config'),
  // Kết quả nhận diện mới nhất: cảnh báo, ảnh từng trang, id file kern
  result: (scoreId: string) => apiClient.get<ApiResponse<OmrResult>>(`/scores/${scoreId}/omr/result`),
};

export const taskApi = {
  get: (taskId: string) => apiClient.get<ApiResponse<AiTaskInfo>>(`/ai-tasks/${taskId}`),
  // Mới nhất trước
  listOfScore: (scoreId: string) => apiClient.get<ApiResponse<AiTaskInfo[]>>(`/scores/${scoreId}/ai-tasks`),
  cancel: (taskId: string) => apiClient.post<ApiResponse<AiTaskInfo>>(`/ai-tasks/${taskId}/cancel`),
};
