import apiClient from './client';
import { saveBlob, unwrapBlobError } from './fileApi';
import type { ApiResponse } from '../types';
import type { ExportFileInfo, ExportResult, ExportTarget } from '../types/export';

export const exportApi = {
  // Yêu cầu xuất file. Cùng tùy chọn và cùng phiên bản nhạc thì trả file ngay (cached), không thì trả task để theo dõi.
  // MUSICXML khi bản nhạc chưa có MusicXML (chỉ có MIDI gốc) là yêu cầu chuyển MIDI thành bản nhạc.
  // Lỗi: 2701 tùy chọn sai, 2702 quá dài, 2703 quá giới hạn, 2704 máy chủ chưa cấu hình MuseScore, 2705 không có nguồn
  // để chuyển, 2012 chưa có MusicXML
  create: (scoreId: string, targetFormat: ExportTarget, options: object = {}) =>
    apiClient.post<ApiResponse<ExportResult>>(`/scores/${scoreId}/exports`, { targetFormat, options }),
  // File xuất còn trên đĩa, mới nhất trước
  list: (scoreId: string) => apiClient.get<ApiResponse<ExportFileInfo[]>>(`/scores/${scoreId}/exports`),
  // Tải ZIP chứa mọi trang SVG của một lần xuất
  downloadSvgZip: async (scoreId: string, taskId: string, fileName: string): Promise<void> => {
    try {
      const response = await apiClient.get<Blob>(`/scores/${scoreId}/exports/${taskId}/zip`, { responseType: 'blob' });
      saveBlob(response.data, fileName);
    } catch (err) {
      throw await unwrapBlobError(err);
    }
  },
};
