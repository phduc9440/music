/** Quản lý diễn đàn của admin (BE: AdminForumController). */
export interface AdminForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  threadCount: number;
  hiddenThreadCount: number;
}

export interface AdminForumPerson {
  id: string;
  email: string;
  fullName: string | null;
}

export interface AdminForumThread {
  id: string;
  title: string;
  excerpt: string;
  /** Chỉ có ở trang chi tiết. */
  body: string | null;
  categoryId: string;
  categoryName: string;
  author: AdminForumPerson;
  createdAt: string;
  replyCount: number;
  hiddenReplyCount: number;
  /** Báo cáo đang chờ trên chủ đề và các bài trả lời của nó. */
  pendingReports: number;
  hidden: boolean;
  hiddenBy: AdminForumPerson | null;
  hiddenAt: string | null;
  pinned: boolean;
  locked: boolean;
  answered: boolean;
}

export interface AdminForumPost {
  id: string;
  body: string;
  author: AdminForumPerson;
  createdAt: string;
  hidden: boolean;
  hiddenBy: AdminForumPerson | null;
  accepted: boolean;
  pendingReports: number;
}

export interface AdminForumThreadDetail {
  thread: AdminForumThread;
  posts: AdminForumPost[];
}

export type AdminForumStatus = 'ALL' | 'VISIBLE' | 'HIDDEN' | 'PINNED' | 'LOCKED' | 'REPORTED';
