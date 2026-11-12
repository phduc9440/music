import type { AuthProvider, MemberStatus, PracticeMode, SharePermission } from './enums';
import type { PlanBan } from './billing';

/** Quyền quản trị gán cho vai trò tài khoản (BE: AdminPermission). Thứ tự = thứ tự hàng trên bảng quyền. */
export type AdminPermission =
  | 'DASHBOARD_VIEW'
  | 'MEMBERS_VIEW'
  | 'MEMBERS_LOCK'
  | 'TEAMS_MANAGE'
  | 'ANNOUNCEMENTS_SEND'
  | 'SCORES_MODERATE'
  | 'SCORES_APPROVE'
  | 'OFFICIAL_LIBRARY'
  | 'TAGS_MANAGE'
  | 'COMPOSERS_MANAGE'
  | 'REVENUE_VIEW'
  | 'PAYMENTS_REFUND'
  | 'SUBSCRIPTIONS_MANAGE'
  | 'PLANS_MANAGE'
  | 'AI_TASKS_MANAGE'
  | 'SYSTEM_MONITOR';

/** Quyền theo nhóm menu quản trị (nhãn nhóm: admin.menu.sections.<nhóm>, nhãn quyền: admin.roles.permissions.<quyền>). */
export const ADMIN_PERMISSION_GROUPS: { section: string; permissions: AdminPermission[] }[] = [
  { section: 'overview', permissions: ['DASHBOARD_VIEW'] },
  { section: 'users', permissions: ['MEMBERS_VIEW', 'MEMBERS_LOCK', 'TEAMS_MANAGE', 'ANNOUNCEMENTS_SEND'] },
  {
    section: 'content',
    permissions: ['SCORES_MODERATE', 'SCORES_APPROVE', 'OFFICIAL_LIBRARY', 'TAGS_MANAGE', 'COMPOSERS_MANAGE'],
  },
  {
    section: 'billing',
    permissions: ['REVENUE_VIEW', 'PAYMENTS_REFUND', 'SUBSCRIPTIONS_MANAGE', 'PLANS_MANAGE'],
  },
  { section: 'system', permissions: ['AI_TASKS_MANAGE', 'SYSTEM_MONITOR'] },
];

/** Bật quyền ở khóa thì phải bật cả quyền ở giá trị (giống AdminPermission.requires ở BE). */
export const ADMIN_PERMISSION_REQUIRES: Partial<Record<AdminPermission, AdminPermission[]>> = {
  MEMBERS_LOCK: ['MEMBERS_VIEW'],
  SUBSCRIPTIONS_MANAGE: ['MEMBERS_VIEW'],
  PAYMENTS_REFUND: ['REVENUE_VIEW'],
};

/** Vai trò tài khoản kèm quyền quản trị. BE: RoleResponse */
export interface RoleItem {
  id: string;
  /** Mã vai trò: USER, ADMIN, SUPER_ADMIN hoặc mã sinh từ tên. */
  name: string;
  /** Tên hiển thị của vai trò tự tạo; null với vai trò có sẵn. */
  label?: string | null;
  description?: string | null;
  builtIn: boolean;
  /** Chỉnh được quyền (false với USER, SUPER_ADMIN). */
  editable: boolean;
  memberCount: number;
  permissions: AdminPermission[];
}

/** Khớp MemberResponse của BE (entity Member). */
export interface Member {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  /** Giao diện đã lưu trên server; null là chưa chọn (theo hệ thống). */
  uiTheme?: 'LIGHT' | 'DARK' | 'SYSTEM' | null;
  /** Ngôn ngữ đã chọn (mục 6.2); null là chưa chọn (tiếng Việt). */
  locale?: 'VI' | 'EN' | null;
  status?: MemberStatus;
  emailVerified?: boolean;
  authProvider?: AuthProvider;
  roles?: string[];
  /** Quyền quản trị suy ra từ vai trò (BE: AdminPermission); rỗng với tài khoản thường. */
  permissions?: AdminPermission[];
  /** Ngày đăng ký; null với tài khoản tạo trước khi có cột này. */
  createdAt?: string | null;
  lastLoginAt?: string | null;
  /** Gói đang dùng; chỉ có ở danh sách thành viên khu quản trị. */
  plan?: MemberPlanSummary | null;
}

/** Khớp AdminMemberDetailResponse của BE. */
export interface AdminMemberDetail {
  member: Member;
  scoreCount: number;
  publicScores: number;
  pendingScores: number;
  playlistCount: number;
  reviewCount: number;
  practiceSessions: number;
  practiceMinutes: number;
  recentScores: {
    id: string;
    title: string;
    composer?: string | null;
    visibility: string;
    isOfficial?: boolean | null;
    updatedAt?: string | null;
  }[];
  /** Tổng tiền các đơn mua gói đã thanh toán (không tính đơn đã hoàn), VND. */
  purchaseTotal: number;
  purchaseCount: number;
  refundedTotal: number;
  refundedCount: number;
  /** Các lần mua gói đã thanh toán (kể cả đã hoàn), mới nhất trước, tối đa 50. */
  purchases: MemberPurchase[];
  /** Các team người này đang ở (kể cả team đã xóa mềm), team đang hoạt động trước. */
  teams: MemberTeam[];
}

/** Một team của thành viên (BE: AdminMemberDetailResponse.TeamRow). */
export interface MemberTeam {
  id: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'ARRANGER' | 'VIEWER';
  joinedAt?: string | null;
  memberCount: number;
  /** Có giá trị = team đã bị xóa mềm. */
  deletedAt?: string | null;
}

/** Một lần mua gói của thành viên (BE: AdminMemberDetailResponse.Purchase). */
export interface MemberPurchase {
  orderCode: string;
  planName: string;
  period: 'MONTH' | 'YEAR';
  kind: 'NEW' | 'RENEW';
  status: 'PAID' | 'REFUNDED';
  amount: number;
  paidAt: string;
}

/** Khớp entity MemberScore: quyền của người được chia sẻ bản nhạc. */
export interface MemberScore {
  id: string;
  memberId: string;
  scoreId: string;
  permission: SharePermission;
}

/** Khớp entity PracticeSession: một lần luyện tập / chấm điểm. */
export interface PracticeSession {
  id: string;
  memberId: string;
  scoreId: string;
  mode: PracticeMode;
  tempoPercent?: number | null;
  loopStartMeasure?: number | null;
  loopEndMeasure?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  totalNotes?: number | null;
  perfectCount?: number | null;
  earlyCount?: number | null;
  lateCount?: number | null;
  wrongPitchCount?: number | null;
  missedCount?: number | null;
  accuracyPct?: number | null;
  timingAccuracyPct?: number | null;
  scorePoints?: number | null;
  isCompleted?: boolean | null;
}

/** PATCH /api/admin/members/{id}: trường nào bỏ trống thì giữ nguyên. roles là tên không có prefix ROLE_. */
export interface AdminUpdateMemberRequest {
  status?: MemberStatus;
  roles?: string[];
}

/** BE: MemberPlanSummary. status: FREE / ACTIVE / UNLIMITED; source: PAYMENT / ADMIN_GRANT / POINTS_TRIAL / ROLE. */
export interface MemberPlanSummary {
  code: string;
  name: string;
  status: 'FREE' | 'ACTIVE' | 'UNLIMITED';
  source?: 'PAYMENT' | 'POINTS_TRIAL' | 'ADMIN_GRANT' | 'ROLE' | null;
  expiresAt?: string | null;
  /** Các gói đang bị cấm dùng (kèm hạn). */
  bans?: PlanBan[];
}
