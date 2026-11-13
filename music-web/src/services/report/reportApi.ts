import apiClient from '../client';
import type {
  ApiResponse,
  ActivityEntry,
  ContentReport,
  PageResult,
  ReportAction,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '../../types';

export interface ReportPayload {
  reason: ReportReason;
  details?: string;
}

/** Người dùng báo cáo vi phạm (BE: ReportController). */
export const reportApi = {
  reportScore: (scoreId: string, data: ReportPayload) =>
    apiClient.post<ApiResponse<void>>(`/scores/${scoreId}/reports`, data),
  reportComment: (commentId: string, data: ReportPayload) =>
    apiClient.post<ApiResponse<void>>(`/comments/${commentId}/reports`, data),
};

/** Hàng chờ báo cáo và nhật ký của admin (BE: AdminReportController, AdminActivityController). */
export const adminReportApi = {
  list: (params: { page?: number; size?: number; status?: ReportStatus; targetType?: ReportTargetType }) =>
    apiClient.get<ApiResponse<PageResult<ContentReport>>>('/admin/reports', { params }),
  pendingCount: () => apiClient.get<ApiResponse<number>>('/admin/reports/pending-count'),
  resolve: (id: string, data: { action: ReportAction; note?: string }) =>
    apiClient.post<ApiResponse<ContentReport>>(`/admin/reports/${id}/resolve`, data),
  activity: (params: {
    page?: number;
    size?: number;
    actor?: string;
    type?: string;
    targetType?: string;
    from?: string;
    to?: string;
  }) => apiClient.get<ApiResponse<PageResult<ActivityEntry>>>('/admin/activity', { params }),
  activityTypes: () => apiClient.get<ApiResponse<string[]>>('/admin/activity/types'),
};
