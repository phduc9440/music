import apiClient from './client';
import type { ApiResponse, OmrUploadRequest, OmrUploadResult } from '../types';

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
};
