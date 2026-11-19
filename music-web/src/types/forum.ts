/** Diễn đàn (mục 5.5). Khớp các DTO ở BE: dto/response/forum. */
export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  threadCount: number;
}

export interface ForumAuthor {
  id: string;
  /** null khi chưa đặt tên: hiện "Thành viên". */
  fullName: string | null;
  avatarUrl: string | null;
}

export interface ForumThread {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  title: string;
  /** Chỉ có ở trang chi tiết; danh sách dùng excerpt. */
  body: string | null;
  excerpt: string;
  author: ForumAuthor;
  score: { id: string; title: string } | null;
  replyCount: number;
  voteCount: number;
  votedByMe: boolean;
  mine: boolean;
  answered: boolean;
  /** Admin đã ghim: nổi lên đầu danh sách. */
  pinned: boolean;
  /** Admin đã khóa: không trả lời thêm được. */
  locked: boolean;
  subscribed: boolean;
  acceptedPostId: string | null;
  createdAt: string;
  editedAt: string | null;
  lastActivityAt: string;
}

export interface ForumPost {
  id: string;
  threadId: string;
  body: string;
  author: ForumAuthor;
  voteCount: number;
  votedByMe: boolean;
  mine: boolean;
  accepted: boolean;
  /** Bài được trả lời trực tiếp; null khi trả lời chủ đề hoặc bài kia đã bị xóa / ẩn. */
  replyTo: { postId: string; authorName: string | null; excerpt: string } | null;
  createdAt: string;
  editedAt: string | null;
}

export interface ForumThreadDetail {
  thread: ForumThread;
  /** Một trang bài trả lời; bài hay nhất luôn đứng đầu trang 0. */
  posts: ForumPost[];
  postPage: number;
  postSize: number;
  /** Tổng số bài trả lời còn hiển thị (mọi trang). */
  totalPosts: number;
  totalPostPages: number;
}

export interface ForumVote {
  voted: boolean;
  voteCount: number;
}

export type ForumSort = 'LATEST' | 'TOP';

export interface ForumThreadPayload {
  categoryId?: string;
  title: string;
  body: string;
  scoreId?: string | null;
}

/** Giới hạn khớp BE (ForumServiceImpl). */
export const FORUM_TITLE_MIN = 3;
export const FORUM_TITLE_MAX = 150;
export const FORUM_BODY_MAX = 10000;
