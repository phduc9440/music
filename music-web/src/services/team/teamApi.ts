import apiClient from '../client';
import type {
  ApiResponse,
  PageResult,
  RestorableItem,
  Show,
  ShowDetail,
  ShowItemPayload,
  ShowItemStatus,
  ShowPayload,
  Team,
  TeamActivity,
  TeamInvitation,
  TeamInvitationPreview,
  TeamMember,
  TeamRole,
  TeamScore,
  TeamTask,
} from '../../types';

type TeamPayload = { name: string; description?: string | null };

/** Team (mục 4.1): team, thành viên, lời mời, bản nhạc, hoạt động. */
export const teamApi = {
  list: () => apiClient.get<ApiResponse<Team[]>>('/teams'),
  create: (data: TeamPayload) => apiClient.post<ApiResponse<Team>>('/teams', data),
  get: (id: string) => apiClient.get<ApiResponse<Team>>(`/teams/${id}`),
  update: (id: string, data: TeamPayload) => apiClient.put<ApiResponse<Team>>(`/teams/${id}`, data),
  /** Xóa mềm: khôi phục được trong 30 ngày. */
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/teams/${id}`),
  deleted: () => apiClient.get<ApiResponse<RestorableItem[]>>('/teams/deleted'),
  restore: (id: string) => apiClient.post<ApiResponse<Team>>(`/teams/${id}/restore`),
  deletedShows: (id: string) => apiClient.get<ApiResponse<RestorableItem[]>>(`/teams/${id}/shows/deleted`),
  myTasks: () => apiClient.get<ApiResponse<TeamTask[]>>('/teams/my-tasks'),

  members: (id: string) => apiClient.get<ApiResponse<TeamMember[]>>(`/teams/${id}/members`),
  changeRole: (id: string, memberId: string, role: TeamRole) =>
    apiClient.patch<ApiResponse<TeamMember>>(`/teams/${id}/members/${memberId}`, { role }),
  /** Xóa thành viên, hoặc tự rời team khi memberId là chính mình. */
  removeMember: (id: string, memberId: string) =>
    apiClient.delete<ApiResponse<void>>(`/teams/${id}/members/${memberId}`),

  invitations: (id: string) => apiClient.get<ApiResponse<TeamInvitation[]>>(`/teams/${id}/invitations`),
  /** email trống = tạo link mời; token chỉ trả về một lần. */
  invite: (id: string, data: { email?: string | null; role: TeamRole }) =>
    apiClient.post<ApiResponse<TeamInvitation>>(`/teams/${id}/invitations`, data),
  revokeInvitation: (id: string, invitationId: string) =>
    apiClient.delete<ApiResponse<void>>(`/teams/${id}/invitations/${invitationId}`),

  scores: (id: string) => apiClient.get<ApiResponse<TeamScore[]>>(`/teams/${id}/scores`),
  scoreCandidates: (id: string) => apiClient.get<ApiResponse<TeamScore[]>>(`/teams/${id}/scores/candidates`),
  addScore: (id: string, scoreId: string) => apiClient.post<ApiResponse<TeamScore>>(`/teams/${id}/scores`, { scoreId }),
  removeScore: (id: string, scoreId: string) => apiClient.delete<ApiResponse<void>>(`/teams/${id}/scores/${scoreId}`),

  shows: (id: string) => apiClient.get<ApiResponse<Show[]>>(`/teams/${id}/shows`),
  createShow: (id: string, data: ShowPayload) => apiClient.post<ApiResponse<Show>>(`/teams/${id}/shows`, data),
  activities: (id: string, params?: { page?: number; size?: number }) =>
    apiClient.get<ApiResponse<PageResult<TeamActivity>>>(`/teams/${id}/activities`, { params }),

  // Phía người được mời
  myInvitations: () => apiClient.get<ApiResponse<TeamInvitation[]>>('/team-invitations/mine'),
  acceptMine: (invitationId: string) =>
    apiClient.post<ApiResponse<Team>>(`/team-invitations/mine/${invitationId}/accept`),
  declineMine: (invitationId: string) =>
    apiClient.post<ApiResponse<void>>(`/team-invitations/mine/${invitationId}/decline`),
  preview: (token: string) => apiClient.get<ApiResponse<TeamInvitationPreview>>(`/team-invitations/token/${token}`),
  accept: (token: string) => apiClient.post<ApiResponse<Team>>(`/team-invitations/token/${token}/accept`),
};

/** Show của team: bài, phân công, Kanban, thứ tự diễn. Mọi thao tác trên bài trả về cả show để vẽ lại. */
export const showApi = {
  get: (id: string) => apiClient.get<ApiResponse<ShowDetail>>(`/shows/${id}`),
  update: (id: string, data: ShowPayload) => apiClient.put<ApiResponse<Show>>(`/shows/${id}`, data),
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/shows/${id}`),
  restore: (id: string) => apiClient.post<ApiResponse<Show>>(`/shows/${id}/restore`),
  addItem: (id: string, data: ShowItemPayload) => apiClient.post<ApiResponse<ShowDetail>>(`/shows/${id}/items`, data),
  updateItem: (id: string, itemId: string, data: ShowItemPayload) =>
    apiClient.put<ApiResponse<ShowDetail>>(`/shows/${id}/items/${itemId}`, data),
  removeItem: (id: string, itemId: string) => apiClient.delete<ApiResponse<ShowDetail>>(`/shows/${id}/items/${itemId}`),
  reorder: (id: string, itemIds: string[]) =>
    apiClient.put<ApiResponse<ShowDetail>>(`/shows/${id}/items/order`, { itemIds }),
  changeStatus: (id: string, itemId: string, status: ShowItemStatus, note?: string) =>
    apiClient.patch<ApiResponse<ShowDetail>>(`/shows/${id}/items/${itemId}/status`, { status, note }),
};
