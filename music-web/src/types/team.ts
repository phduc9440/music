// Team và Show (mục 4.1). BE: TeamResponse, TeamMemberResponse, TeamInvitationResponse, ShowResponse, ShowItemResponse...

export type TeamRole = 'OWNER' | 'MANAGER' | 'ARRANGER' | 'VIEWER';
export type ShowStatus = 'PREPARING' | 'DONE';
export type ShowItemStatus = 'TODO' | 'ARRANGING' | 'IN_REVIEW' | 'APPROVED';

export const TEAM_ROLES: TeamRole[] = ['OWNER', 'MANAGER', 'ARRANGER', 'VIEWER'];
export const SHOW_ITEM_STATUSES: ShowItemStatus[] = ['TODO', 'ARRANGING', 'IN_REVIEW', 'APPROVED'];

/** Quyền chủ nhóm tích / bỏ tích cho từng vai trò (BE: TeamPermission). Thứ tự = thứ tự hàng trên bảng quyền. */
export type TeamPermission =
  | 'EDIT_TEAM'
  | 'MANAGE_MANAGERS'
  | 'MANAGE_MEMBERS'
  | 'MANAGE_SHOWS'
  | 'APPROVE_ANY'
  | 'EDIT_SCORES'
  | 'MANAGE_SCORES'
  | 'REMOVE_SCORES'
  | 'ADD_SCORES'
  | 'COMMENT';

export const TEAM_PERMISSIONS: TeamPermission[] = [
  'EDIT_TEAM',
  'MANAGE_MANAGERS',
  'MANAGE_MEMBERS',
  'MANAGE_SHOWS',
  'APPROVE_ANY',
  'EDIT_SCORES',
  'MANAGE_SCORES',
  'REMOVE_SCORES',
  'ADD_SCORES',
  'COMMENT',
];

/** Vai trò chủ nhóm chỉnh được quyền (chủ nhóm luôn đủ quyền). */
export type ConfigurableTeamRole = Exclude<TeamRole, 'OWNER'>;
export const CONFIGURABLE_TEAM_ROLES: ConfigurableTeamRole[] = ['MANAGER', 'ARRANGER', 'VIEWER'];

/** Bật quyền ở khóa thì phải bật cả các quyền ở giá trị (giống TeamPermission.requires ở BE). */
export const TEAM_PERMISSION_REQUIRES: Partial<Record<TeamPermission, TeamPermission[]>> = {
  MANAGE_MANAGERS: ['MANAGE_MEMBERS'],
  MANAGE_SCORES: ['EDIT_SCORES'],
  EDIT_SCORES: ['COMMENT'],
};

/** Người có danh sách quyền `perms` có quyền `p` không (danh sách lấy từ BE, chủ nhóm đã có đủ). */
export const hasTeamPermission = (perms: readonly TeamPermission[] | null | undefined, p: TeamPermission) =>
  !!perms?.includes(p);

/**
 * Có được mời, đổi vai trò, xóa người mang vai trò `role` (hoặc gán `role` cho người khác) không, theo bảng quyền: vai trò
 * chủ nhóm chỉ chủ nhóm; quản lý cần MANAGE_MANAGERS; người phối, người xem cần MANAGE_MEMBERS. Giống
 * RolePermissions.canAssign ở BE.
 */
export const canAssignTeamRole = (
  myRole: TeamRole | null | undefined,
  perms: readonly TeamPermission[] | null | undefined,
  role: TeamRole,
) => {
  if (role === 'OWNER') return myRole === 'OWNER';
  return hasTeamPermission(perms, role === 'MANAGER' ? 'MANAGE_MANAGERS' : 'MANAGE_MEMBERS');
};

/** Có quyền mời ít nhất một vai trò (thấy khung mời và lời mời đang chờ). */
export const canInviteToTeam = (perms: readonly TeamPermission[] | null | undefined) =>
  hasTeamPermission(perms, 'MANAGE_MEMBERS') || hasTeamPermission(perms, 'MANAGE_MANAGERS');

/** Bảng quyền của team. BE: TeamPermissionsResponse */
export interface TeamPermissionTable {
  roles: Record<ConfigurableTeamRole, TeamPermission[]>;
  defaults: Record<ConfigurableTeamRole, TeamPermission[]>;
  /** Người đang xem là chủ nhóm: được tích / bỏ tích. */
  editable: boolean;
}

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  myRole: TeamRole;
  /** Quyền của tôi theo bảng quyền của team (chủ nhóm: mọi quyền). */
  myPermissions: TeamPermission[];
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
  myPermissions: TeamPermission[];
  items: ShowItem[];
  /** Thành viên giao việc được (không gồm VIEWER). */
  assignees: TeamMember[];
}

export type TeamActivityType =
  | 'TEAM_CREATED'
  | 'TEAM_UPDATED'
  | 'TEAM_RESTORED'
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
  | 'SHOW_RESTORED'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVED'
  | 'ITEM_ASSIGNED'
  | 'ITEM_STATUS_CHANGED'
  | 'PERMISSIONS_CHANGED';

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

/** Team hoặc show đã xóa mềm còn khôi phục được (30 ngày). BE: RestorableItemResponse */
export interface RestorableItem {
  id: string;
  name: string;
  description?: string | null;
  deletedAt: string;
  deletedByName?: string | null;
  restorableUntil: string;
}

// Quản lý team của admin, BE: AdminTeamResponse, AdminTeamSummaryResponse, AdminTeamDetailResponse
export interface AdminTeam {
  id: string;
  name: string;
  description?: string | null;
  creatorId: string;
  creatorName: string;
  creatorEmail: string;
  memberCount: number;
  scoreCount: number;
  showCount: number;
  preparingShows: number;
  createdAt?: string | null;
  lastActivityAt?: string | null;
  planActive: boolean;
  memberLimit?: number | null;
  /** Xóa mềm: có giá trị = đã xóa. */
  deletedAt?: string | null;
  restorableUntil?: string | null;
  restorable: boolean;
  deletedByAdmin: boolean;
  deletedReason?: string | null;
}

export interface AdminTeamSummary {
  teams: number;
  activeTeams7d: number;
  teamMembers: number;
  preparingShows: number;
  openItems: number;
  overdueItems: number;
}

export interface AdminTeamDetail {
  team: AdminTeam;
  members: TeamMember[];
  shows: Show[];
  scores: {
    id: string;
    title: string;
    ownerName?: string | null;
    visibility?: string | null;
    updatedAt?: string | null;
  }[];
  recentActivities: TeamActivity[];
}
