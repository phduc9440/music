import apiClient from './client';
import type { ApiResponse, OfficialRequest, OfficialRequestStatus, PageResult } from '../types';

export const officialRequestApi = {
  // ADMIN: xin chủ đồng ý đưa một bản nhạc công khai vào kho score mẫu
  request: (scoreId: string) => apiClient.post<ApiResponse<OfficialRequest>>(`/scores/${scoreId}/official-request`),
  // ADMIN: mọi lời xin, lọc theo trạng thái
  list: (params?: { page?: number; size?: number; status?: OfficialRequestStatus | '' }) =>
    apiClient.get<ApiResponse<PageResult<OfficialRequest>>>('/admin/official-requests', { params }),
  // ADMIN: rút lại lời xin đang chờ
  cancel: (id: string) => apiClient.delete<ApiResponse<OfficialRequest>>(`/official-requests/${id}`),
  // Chủ sở hữu: các lời xin đang chờ mình trả lời
  mine: () => apiClient.get<ApiResponse<OfficialRequest[]>>('/official-requests/mine'),
  accept: (id: string) => apiClient.post<ApiResponse<OfficialRequest>>(`/official-requests/${id}/accept`),
  decline: (id: string) => apiClient.post<ApiResponse<OfficialRequest>>(`/official-requests/${id}/decline`),
};
