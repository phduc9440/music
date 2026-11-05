import apiClient from './client';
import type { AccessRequest, ApiResponse, MyAccess, ScoreSharing, SharePermission, SharedJoinResult } from '../types';

export const sharingApi = {
  // Chủ sở hữu hoặc ADMIN: trạng thái chia sẻ của một bản nhạc
  get: (scoreId: string) => apiClient.get<ApiResponse<ScoreSharing>>(`/scores/${scoreId}/sharing`),
  // permission = null để tắt liên kết (mọi người đã vào bằng liên kết bị thu hồi quyền)
  setLink: (scoreId: string, permission: SharePermission | null) =>
    apiClient.put<ApiResponse<ScoreSharing>>(`/scores/${scoreId}/sharing/link`, { permission }),
  resetLink: (scoreId: string) => apiClient.post<ApiResponse<ScoreSharing>>(`/scores/${scoreId}/sharing/link/reset`),
  addMember: (scoreId: string, email: string, permission: SharePermission) =>
    apiClient.post<ApiResponse<ScoreSharing>>(`/scores/${scoreId}/sharing/members`, { email, permission }),
  updateMember: (scoreId: string, memberId: string, permission: SharePermission) =>
    apiClient.put<ApiResponse<ScoreSharing>>(`/scores/${scoreId}/sharing/members/${memberId}`, { permission }),
  removeMember: (scoreId: string, memberId: string) =>
    apiClient.delete<ApiResponse<ScoreSharing>>(`/scores/${scoreId}/sharing/members/${memberId}`),
  // Xin quyền: yêu cầu nằm trong member_scores của tôi cho tới khi chủ sở hữu duyệt
  requestAccess: (scoreId: string, permission: SharePermission, message?: string) =>
    apiClient.post<ApiResponse<MyAccess>>(`/scores/${scoreId}/access-requests`, { permission, message }),
  myAccess: (scoreId: string) => apiClient.get<ApiResponse<MyAccess>>(`/scores/${scoreId}/access-requests/me`),
  // Chủ sở hữu hoặc ADMIN
  accessRequests: (scoreId: string) =>
    apiClient.get<ApiResponse<AccessRequest[]>>(`/scores/${scoreId}/access-requests`),
  // granted bỏ trống = cấp đúng cấp người ta xin
  approveRequest: (scoreId: string, memberId: string, granted?: SharePermission) =>
    apiClient.post<ApiResponse<ScoreSharing>>(
      `/scores/${scoreId}/access-requests/${memberId}/approve`,
      granted ? { permission: granted } : {},
    ),
  rejectRequest: (scoreId: string, memberId: string) =>
    apiClient.post<ApiResponse<ScoreSharing>>(`/scores/${scoreId}/access-requests/${memberId}/reject`),
  // Mở liên kết chia sẻ: người đăng nhập nhận quyền theo cấp của liên kết
  join: (token: string) => apiClient.post<ApiResponse<SharedJoinResult>>(`/shared/${token}/join`),
};
