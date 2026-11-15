// Góp ý gắn vào ô nhịp (mục 4.2). BE: ScoreCommentResponse, ScoreCommentsResponse, CommentMemberResponse

export type CommentStatus = 'OPEN' | 'RESOLVED';

/** Bộ lọc của bảng Góp ý: theo trạng thái, "Nhắc tới tôi" hoặc tất cả. */
export type CommentFilter = 'OPEN' | 'RESOLVED' | 'MENTIONED' | 'ALL';

/** Người viết, người được nhắc hoặc người đánh dấu đã xử lý (không có email). */
export interface CommentMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ScoreComment {
  id: string;
  scoreId: string;
  /** Null là góp ý gốc. */
  parentId?: string | null;
  author: CommentMember;
  content: string;
  mentions: CommentMember[];
  createdAt: string;
  editedAt?: string | null;
  // Chỉ góp ý gốc
  startMeasure?: number | null;
  endMeasure?: number | null;
  partId?: string | null;
  noteIds?: string[] | null;
  /** Version MusicXML lúc viết. */
  scoreVersion?: number | null;
  /** Số ô đã khác lúc viết: vị trí có thể đã lệch. */
  outdated?: boolean;
  status?: CommentStatus | null;
  resolvedBy?: CommentMember | null;
  resolvedAt?: string | null;
  replies?: ScoreComment[];
  // Quyền của người đang xem
  canEdit: boolean;
  canDelete: boolean;
  canResolve?: boolean;
}

export interface ScoreComments {
  canComment: boolean;
  measureCount?: number | null;
  currentVersion?: number | null;
  openCount: number;
  resolvedCount: number;
  mentionedCount: number;
  comments: ScoreComment[];
}

export interface ScoreCommentPayload {
  content: string;
  startMeasure: number;
  endMeasure?: number | null;
  partId?: string | null;
  noteIds?: string[] | null;
  mentionIds?: string[];
}

export interface ScoreCommentUpdatePayload {
  content?: string;
  status?: CommentStatus;
  mentionIds?: string[];
}
