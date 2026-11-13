import type { CommentMember } from './comment';

// Đề xuất sửa theo ô nhịp (mục 4.3). BE: SuggestionSummaryResponse, SuggestionDetailResponse, SuggestionChangeResponse

export type SuggestionStatus = 'OPEN' | 'ACCEPTED' | 'PARTIAL' | 'REJECTED' | 'WITHDRAWN' | 'OUTDATED';

/** Bộ lọc danh sách đề xuất của một bản nhạc. */
export type SuggestionFilter = 'OPEN' | 'CLOSED' | 'ALL';

export type SuggestionChangeStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** Lý do một đề xuất còn mở nhưng không áp dụng được nữa. */
export type SuggestionStaleReason = 'VERSION_CHANGED' | 'STRUCTURE_CHANGED' | 'CONTEXT_CHANGED';

export interface SuggestionSummary {
  id: string;
  title: string;
  status: SuggestionStatus;
  /** Đổi cấu trúc (khung, khóa, nhịp): không chia theo ô, chỉ nhận tất cả. */
  structural: boolean;
  /** Đề xuất còn mở nhưng bản chính đã đổi đến mức không áp dụng được. */
  stale: boolean;
  changeCount: number;
  /** Null là do hệ thống tạo. */
  author?: CommentMember | null;
  createdAt: string;
  decidedAt?: string | null;
}

export interface SuggestionChange {
  id: string;
  partIndex: number;
  partName: string;
  /** Thứ tự ô trong part, từ 0. */
  measureIndex: number;
  /** Số ô để hiển thị. */
  measureNumber: string;
  status: SuggestionChangeStatus;
  /** Bản chính đã sửa ô này sau khi đề xuất: nhận sẽ thay bản hiện tại. */
  conflict: boolean;
}

export interface SuggestionDetail extends SuggestionSummary {
  scoreId: string;
  scoreTitle?: string | null;
  description?: string | null;
  source: 'EDITOR' | string;
  baseVersion: number;
  currentVersion: number;
  staleReason?: SuggestionStaleReason | null;
  changes: SuggestionChange[];
  decidedBy?: CommentMember | null;
  decisionNote?: string | null;
  /** Version tạo ra khi nhận. */
  appliedVersion?: number | null;
  canDecide: boolean;
  canWithdraw: boolean;
}

export interface SuggestionCreatePayload {
  /** MusicXML đã sửa (không DOCTYPE, như Editor xuất). */
  musicXml: string;
  baseVersion: number;
  title: string;
  description?: string;
}

export interface SuggestionDecisionPayload {
  /** Bỏ trống khi nhận: nhận tất cả. */
  changeIds?: string[];
  note?: string;
}
