import apiClient from './client';
import type { ApiResponse, Playlist } from '../types';

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
};
