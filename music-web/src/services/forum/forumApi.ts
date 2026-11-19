import apiClient from '../client';
import { isGuest } from '../../utils/session';
import type {
  AdminForumCategory,
  AdminForumStatus,
  AdminForumThread,
  AdminForumThreadDetail,
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
  // Khách chưa đăng nhập đọc diễn đàn qua API công khai (chỉ đọc, không có dấu cá nhân)
  categories: () =>
    apiClient.get<ApiResponse<ForumCategory[]>>(isGuest() ? '/public/forum/categories' : '/forum/categories'),
  threads: (params: {
    categoryId?: string;
    keyword?: string;
    sort?: ForumSort;
    unanswered?: boolean;
    mine?: boolean;
    page?: number;
    size?: number;
  }) =>
    apiClient.get<ApiResponse<PageResult<ForumThread>>>(isGuest() ? '/public/forum/threads' : '/forum/threads', {
      params,
    }),
  /** Một trang bài trả lời; focusPostId hợp lệ thì BE trả đúng trang chứa bài đó. */
  thread: (id: string, params?: { page?: number; size?: number; focusPostId?: string }) =>
    apiClient.get<ApiResponse<ForumThreadDetail>>(`${isGuest() ? '/public/forum' : '/forum'}/threads/${id}`, {
      params,
    }),
  createThread: (data: ForumThreadPayload) => apiClient.post<ApiResponse<ForumThread>>('/forum/threads', data),
  updateThread: (id: string, data: ForumThreadPayload) =>
    apiClient.put<ApiResponse<ForumThread>>(`/forum/threads/${id}`, data),
  deleteThread: (id: string) => apiClient.delete<ApiResponse<void>>(`/forum/threads/${id}`),
  /** replyToPostId: trả lời trực tiếp vào một bài (người đó nhận thông báo riêng); bỏ trống = trả lời chủ đề. */
  reply: (threadId: string, body: string, replyToPostId?: string) =>
    apiClient.post<ApiResponse<ForumPost>>(`/forum/threads/${threadId}/posts`, { body, replyToPostId }),
  updatePost: (postId: string, body: string) =>
    apiClient.put<ApiResponse<ForumPost>>(`/forum/posts/${postId}`, { body }),
  deletePost: (postId: string) => apiClient.delete<ApiResponse<void>>(`/forum/posts/${postId}`),
  voteThread: (id: string) => apiClient.post<ApiResponse<ForumVote>>(`/forum/threads/${id}/vote`),
  votePost: (id: string) => apiClient.post<ApiResponse<ForumVote>>(`/forum/posts/${id}/vote`),
  /** Chọn hoặc bỏ chọn câu trả lời hay nhất; trả về chủ đề sau khi đổi. */
  accept: (postId: string) => apiClient.post<ApiResponse<ForumThread>>(`/forum/posts/${postId}/accept`),
  subscribe: (threadId: string, subscribed: boolean) =>
    apiClient.put<ApiResponse<void>>(`/forum/threads/${threadId}/subscription`, { subscribed }),
};

/** Quản lý diễn đàn của admin (quyền FORUM_MANAGE). */
export const adminForumApi = {
  categories: () => apiClient.get<ApiResponse<AdminForumCategory[]>>('/admin/forum/categories'),
  createCategory: (data: { name: string; description?: string }) =>
    apiClient.post<ApiResponse<AdminForumCategory>>('/admin/forum/categories', data),
  updateCategory: (id: string, data: { name: string; description?: string }) =>
    apiClient.put<ApiResponse<AdminForumCategory>>(`/admin/forum/categories/${id}`, data),
  deleteCategory: (id: string) => apiClient.delete<ApiResponse<void>>(`/admin/forum/categories/${id}`),
  reorderCategories: (ids: string[]) => apiClient.put<ApiResponse<void>>('/admin/forum/categories/order', ids),
  threads: (params: {
    keyword?: string;
    categoryId?: string;
    status?: AdminForumStatus;
    page?: number;
    size?: number;
  }) => apiClient.get<ApiResponse<PageResult<AdminForumThread>>>('/admin/forum/threads', { params }),
  thread: (id: string) => apiClient.get<ApiResponse<AdminForumThreadDetail>>(`/admin/forum/threads/${id}`),
  setThreadHidden: (id: string, value: boolean) =>
    apiClient.put<ApiResponse<void>>(`/admin/forum/threads/${id}/hidden`, null, { params: { value } }),
  setThreadPinned: (id: string, value: boolean) =>
    apiClient.put<ApiResponse<void>>(`/admin/forum/threads/${id}/pinned`, null, { params: { value } }),
  setThreadLocked: (id: string, value: boolean) =>
    apiClient.put<ApiResponse<void>>(`/admin/forum/threads/${id}/locked`, null, { params: { value } }),
  setPostHidden: (id: string, value: boolean) =>
    apiClient.put<ApiResponse<void>>(`/admin/forum/posts/${id}/hidden`, null, { params: { value } }),
};
