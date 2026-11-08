import apiClient from './client';
import type { ApiResponse } from '../types';
import type { ExportFileInfo, ExportFormat, ExportOptions, ExportResult } from '../types/export';

export const exportApi = {
  // Yêu cầu xuất file. Cùng tùy chọn và cùng phiên bản nhạc thì trả file ngay (cached), không thì trả task để theo dõi.
  // Lỗi: 2701 tùy chọn sai, 2702 quá dài, 2703 quá giới hạn, 2704 máy chủ chưa cấu hình MuseScore, 2012 chưa có MusicXML
  create: (scoreId: string, targetFormat: ExportFormat, options: ExportOptions) =>
    apiClient.post<ApiResponse<ExportResult>>(`/scores/${scoreId}/exports`, { targetFormat, options }),
  // File xuất còn trên đĩa, mới nhất trước
  list: (scoreId: string) => apiClient.get<ApiResponse<ExportFileInfo[]>>(`/scores/${scoreId}/exports`),
};
