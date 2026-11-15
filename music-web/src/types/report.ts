/** Báo cáo vi phạm và nhật ký quản trị (R5). Khớp ReportResponse / AuditLogResponse của BE. */
export type ReportTargetType = 'SCORE' | 'COMMENT' | 'FORUM_POST';
export type ReportReason = 'COPYRIGHT' | 'SPAM' | 'INAPPROPRIATE' | 'OTHER';
export type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';
export type ReportAction = 'DISMISS' | 'UNPUBLISH' | 'HIDE' | 'SOFT_DELETE' | 'LOCK_ACCOUNT';

export const REPORT_REASONS: ReportReason[] = ['COPYRIGHT', 'SPAM', 'INAPPROPRIATE', 'OTHER'];

/** Cách xử lý được chọn theo loại đối tượng (khớp ReportAction.allowedFor ở BE). */
export const REPORT_ACTIONS_BY_TARGET: Record<ReportTargetType, ReportAction[]> = {
  SCORE: ['DISMISS', 'UNPUBLISH', 'SOFT_DELETE', 'LOCK_ACCOUNT'],
  COMMENT: ['DISMISS', 'HIDE', 'LOCK_ACCOUNT'],
  FORUM_POST: ['DISMISS', 'LOCK_ACCOUNT'],
};

export interface ReportParty {
  id: string;
  email: string;
  fullName: string | null;
}

export interface ContentReport {
  id: string;
  targetType: ReportTargetType;
  scoreId: string | null;
  commentId: string | null;
  targetLabel: string | null;
  /** false khi bản nhạc đã vào thùng rác hoặc góp ý đã bị ẩn: chỉ còn chọn được Bỏ qua. */
  targetAvailable: boolean;
  owner: ReportParty | null;
  reporter: ReportParty;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  action: ReportAction | null;
  resolutionNote: string | null;
  resolvedBy: ReportParty | null;
  resolvedAt: string | null;
  createdAt: string;
  pendingOnTarget: number;
}

/** Một dòng trang "Nhật ký": BE suy ra từ bảng gốc (báo cáo, bản nhạc, góp ý, nhóm, chế tài gói), không có bảng riêng. */
export type ActivityType =
  | 'REPORT_CREATED'
  | 'REPORT_RESOLVED'
  | 'SCORE_DELETED_BY_ADMIN'
  | 'COMMENT_HIDDEN'
  | 'TEAM_DELETED_BY_ADMIN'
  | 'PLAN_SANCTION';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  occurredAt: string;
  actorId: string | null;
  actorEmail: string | null;
  /** SCORE, COMMENT, TEAM hoặc MEMBER. */
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  /** Lý do, ghi chú hoặc loại chế tài lấy từ dòng gốc. */
  detail: string | null;
}
