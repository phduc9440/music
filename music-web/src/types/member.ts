import type { AuthProvider, MemberStatus, PracticeMode, SharePermission } from './enums';

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
  /** Đang bị cấm dùng gói trả phí đến lúc này. */
  bannedUntil?: string | null;
}
