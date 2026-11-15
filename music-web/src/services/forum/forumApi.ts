import apiClient from '../client';
import type {
  ApiResponse,
  ForumCategory,
  ForumPost,
  ForumSort,
  ForumThread,
  ForumThreadDetail,
  ForumThreadPayload,
  ForumVote,
  PageResult,
} from '../../types';

/** Diễn đàn (BE: ForumController). Cần đăng nhập. */
export const forumApi = {
  categories: () => apiClient.get<ApiResponse<ForumCategory[]>>('/forum/categories'),
  threads: (params: {
    categoryId?: string;
    keyword?: string;
    sort?: ForumSort;
    unanswered?: boolean;
    mine?: boolean;
    page?: number;
    size?: number;
  }) => apiClient.get<ApiResponse<PageResult<ForumThread>>>('/forum/threads', { params }),
  thread: (id: string) => apiClient.get<ApiResponse<ForumThreadDetail>>(`/forum/threads/${id}`),
  createThread: (data: ForumThreadPayload) => apiClient.post<ApiResponse<ForumThread>>('/forum/threads', data),
  updateThread: (id: string, data: ForumThreadPayload) =>
    apiClient.put<ApiResponse<ForumThread>>(`/forum/threads/${id}`, data),
  deleteThread: (id: string) => apiClient.delete<ApiResponse<void>>(`/forum/threads/${id}`),
  /** replyToPostId: trả lời trực tiếp vào một bài (người đó nhận thông báo riêng); bỏ trống = trả lời chủ đề. */
  reply: (threadId: string, body: string, replyToPostId?: string) =>
    apiClient.post<ApiResponse<ForumPost>>(`/forum/threads/${threadId}/posts`, { body, replyToPostId }),
  updatePost: (postId: string, body: string) => apiClient.put<ApiResponse<ForumPost>>(`/forum/posts/${postId}`, { body }),
  deletePost: (postId: string) => apiClient.delete<ApiResponse<void>>(`/forum/posts/${postId}`),
  voteThread: (id: string) => apiClient.post<ApiResponse<ForumVote>>(`/forum/threads/${id}/vote`),
  votePost: (id: string) => apiClient.post<ApiResponse<ForumVote>>(`/forum/posts/${id}/vote`),
  /** Chọn hoặc bỏ chọn câu trả lời hay nhất; trả về chủ đề sau khi đổi. */
  accept: (postId: string) => apiClient.post<ApiResponse<ForumThread>>(`/forum/posts/${postId}/accept`),
  subscribe: (threadId: string, subscribed: boolean) =>
    apiClient.put<ApiResponse<void>>(`/forum/threads/${threadId}/subscription`, { subscribed }),
};
