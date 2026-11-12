// Team và Show (mục 4.1). BE: TeamResponse, TeamMemberResponse, TeamInvitationResponse, ShowResponse, ShowItemResponse...

export type TeamRole = 'OWNER' | 'MANAGER' | 'ARRANGER' | 'VIEWER';
export type ShowStatus = 'PREPARING' | 'DONE';
export type ShowItemStatus = 'TODO' | 'ARRANGING' | 'IN_REVIEW' | 'APPROVED';

export const TEAM_ROLES: TeamRole[] = ['OWNER', 'MANAGER', 'ARRANGER', 'VIEWER'];
export const SHOW_ITEM_STATUSES: ShowItemStatus[] = ['TODO', 'ARRANGING', 'IN_REVIEW', 'APPROVED'];

/** OWNER hoặc MANAGER: mời, đổi vai trò, quản lý show và phân công. */
export const canManageTeam = (role?: TeamRole | null) => role === 'OWNER' || role === 'MANAGER';

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  myRole: TeamRole;
  memberCount: number;
  scoreCount: number;
  preparingShows: number;
  createdByName?: string | null;
  createdAt?: string | null;
  /** Số thành viên tối đa theo gói của người tạo; null = không giới hạn. */
  memberLimit?: number | null;
  /** Gói của người tạo còn quyền lợi team (mời thêm được). */
  planActive: boolean;
}

export interface TeamMember {
  memberId: string;
  fullName?: string | null;
  email: string;
  avatarUrl?: string | null;
  role: TeamRole;
  joinedAt?: string | null;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  /** null = link mời. */
  email?: string | null;
  role: TeamRole;
  invitedByName?: string | null;
  createdAt?: string | null;
  expiresAt: string;
  /** Chỉ có ngay lúc tạo lời mời. */
  token?: string | null;
}

export interface TeamInvitationPreview {
  teamId: string;
  teamName: string;
  teamDescription?: string | null;
  role: TeamRole;
  invitedByName?: string | null;
  email?: string | null;
  expiresAt: string;
  state: 'VALID' | 'EXPIRED' | 'USED' | 'REVOKED';
  alreadyMember: boolean;
  emailMismatch: boolean;
}

export interface TeamScore {
  id: string;
  title: string;
  composer?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  measureCount?: number | null;
  difficulty?: string | null;
  updatedAt?: string | null;
  canRemove: boolean;
}

export interface Show {
  id: string;
  teamId: string;
  name: string;
  /** yyyy-MM-dd */
  showDate?: string | null;
  venue?: string | null;
  notes?: string | null;
  status: ShowStatus;
  itemCount: number;
  approvedCount: number;
  createdAt?: string | null;
}

export interface ShowItem {
  id: string;
  scoreId: string;
  scoreTitle: string;
  scoreComposer?: string | null;
  position: number;
  arrangerId?: string | null;
  arrangerName?: string | null;
  reviewerId?: string | null;
  reviewerName?: string | null;
  /** yyyy-MM-dd */
  dueDate?: string | null;
  status: ShowItemStatus;
  notes?: string | null;
  reviewNote?: string | null;
  /** Trạng thái người đang xem được chuyển bài sang (theo vai trò và phân công). */
  allowedStatuses: ShowItemStatus[];
}

export interface ShowDetail {
  show: Show;
  teamName: string;
  myRole: TeamRole;
  items: ShowItem[];
  /** Thành viên giao việc được (không gồm VIEWER). */
  assignees: TeamMember[];
}

export type TeamActivityType =
  | 'TEAM_CREATED'
  | 'TEAM_UPDATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'INVITATION_SENT'
  | 'SCORE_ADDED'
  | 'SCORE_REMOVED'
  | 'SHOW_CREATED'
  | 'SHOW_UPDATED'
  | 'SHOW_DELETED'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVED'
  | 'ITEM_ASSIGNED'
  | 'ITEM_STATUS_CHANGED';

export interface TeamActivity {
  id: string;
  type: TeamActivityType;
  actorName?: string | null;
  params: Record<string, string>;
  createdAt: string;
}

export interface TeamTask {
  itemId: string;
  showId: string;
  showName: string;
  showDate?: string | null;
  teamId: string;
  teamName: string;
  scoreId: string;
  scoreTitle: string;
  status: ShowItemStatus;
  dueDate?: string | null;
  asArranger: boolean;
  asReviewer: boolean;
}

export interface ShowPayload {
  name: string;
  showDate?: string | null;
  venue?: string | null;
  notes?: string | null;
  status?: ShowStatus | null;
}

export interface ShowItemPayload {
  scoreId?: string;
  arrangerId?: string | null;
  reviewerId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
}
