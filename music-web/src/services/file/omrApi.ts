import apiClient from '../client';
import type { AiTaskInfo, ApiResponse, OmrResult, OmrUploadRequest, OmrUploadResult } from '../../types';

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
