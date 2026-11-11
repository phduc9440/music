import apiClient from '../client';
import type { ApiResponse, ScoreImportResult } from '../../types';

export const importApi = {
  // Nhập trực tiếp 1 file MusicXML (.musicxml/.xml/.mxl) hoặc MIDI (.mid/.midi), không qua OMR
  importScore: (
    data: { file: File; title: string; composer: string; tagIds?: string[] },
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append('file', data.file);
    if (data.title.trim()) form.append('title', data.title.trim());
    if (data.composer.trim()) form.append('composer', data.composer.trim());
    data.tagIds?.forEach((id) => form.append('tagIds', id));
    return apiClient.post<ApiResponse<ScoreImportResult>>('/scores/import', form, {
      headers: { 'Content-Type': undefined },
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded * 100) / e.total)),
    });
  },
};
