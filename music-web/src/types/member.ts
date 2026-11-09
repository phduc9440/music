import type { AuthProvider, MemberStatus, PracticeMode, SharePermission } from './enums';

/** Khớp MemberResponse của BE (entity Member). */
export interface Member {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  status?: MemberStatus;
  emailVerified?: boolean;
  authProvider?: AuthProvider;
  roles?: string[];
  /** Ngày đăng ký; null với tài khoản tạo trước khi có cột này. */
  createdAt?: string | null;
  lastLoginAt?: string | null;
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
