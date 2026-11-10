import apiClient from './client';
import type { ApiResponse, Playlist, PlaylistItem } from '../types';

export interface PlaylistPayload {
  name: string;
  description: string;
}

export const playlistApi = {
  list: () => apiClient.get<ApiResponse<Playlist[]>>('/playlists'),
  get: (id: string) => apiClient.get<ApiResponse<Playlist>>(`/playlists/${id}`),
  create: (data: PlaylistPayload) => apiClient.post<ApiResponse<Playlist>>('/playlists', data),
  update: (id: string, data: PlaylistPayload) => apiClient.put<ApiResponse<Playlist>>(`/playlists/${id}`, data),
  remove: (id: string) => apiClient.delete<ApiResponse<void>>(`/playlists/${id}`),
  // 3.10: bài trong playlist (mọi lệnh ghi đều trả danh sách mới theo thứ tự)
  items: (id: string) => apiClient.get<ApiResponse<PlaylistItem[]>>(`/playlists/${id}/scores`),
  addScore: (id: string, scoreId: string) =>
    apiClient.post<ApiResponse<PlaylistItem[]>>(`/playlists/${id}/scores`, { scoreId }),
  removeScore: (id: string, scoreId: string) =>
    apiClient.delete<ApiResponse<PlaylistItem[]>>(`/playlists/${id}/scores/${scoreId}`),
  reorder: (id: string, scoreIds: string[]) =>
    apiClient.put<ApiResponse<PlaylistItem[]>>(`/playlists/${id}/scores/order`, { scoreIds }),
};
