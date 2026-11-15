import { t } from '../../i18n/core';
import type { AdminPermission, Member } from '../../types';
import { hasAdminPermission, isSuperAdminMember } from '../../utils/auth';
import type { IconName } from '../ui';

export interface MenuItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Hiện số việc đang chờ cạnh mục này: bản chờ duyệt công khai hoặc báo cáo chờ xử lý. */
  pendingBadge?: 'scores' | 'reports';
  /** Chỉ hiện khi có ít nhất một trong các quyền này; bỏ trống = ai vào được khu quản trị cũng thấy. */
  permissions?: AdminPermission[];
  /** Chỉ SUPER_ADMIN thấy (trang Vai trò). */
  superOnly?: boolean;
}

/** Mục menu: nhãn là getter nên luôn lấy theo ngôn ngữ đang dùng (chuỗi ở locales, nhóm admin.menu). */
const item = (to: string, key: string, icon: IconName, extra: Partial<MenuItem> = {}): MenuItem => ({
  to,
  icon,
  ...extra,
  get label() {
    return t(`admin.menu.items.${key}`);
  },
});

const section = (key: string, items: MenuItem[]) => ({
  items,
  get section() {
    return t(`admin.menu.sections.${key}`);
  },
});

export const MENU: { section: string; items: MenuItem[] }[] = [
  section('overview', [item('/admin', 'dashboard', 'dashboard', { end: true, permissions: ['DASHBOARD_VIEW'] })]),
  section('users', [
    item('/admin/members', 'members', 'users', { permissions: ['MEMBERS_VIEW'] }),
    item('/admin/roles', 'roles', 'shield', { superOnly: true }),
    item('/admin/teams', 'teams', 'share', { permissions: ['TEAMS_MANAGE'] }),
    item('/admin/announcements', 'announcements', 'megaphone', { permissions: ['ANNOUNCEMENTS_SEND'] }),
  ]),
  section('content', [
    item('/admin/scores', 'scores', 'music', { permissions: ['SCORES_MODERATE'] }),
    item('/admin/pending-scores', 'pending', 'clock', { pendingBadge: 'scores', permissions: ['SCORES_APPROVE'] }),
    item('/admin/reports', 'reports', 'alert', { pendingBadge: 'reports', permissions: ['REPORTS_MODERATE'] }),
    item('/admin/official-scores', 'official', 'library', { permissions: ['OFFICIAL_LIBRARY'] }),
    item('/admin/tags', 'tags', 'tag', { permissions: ['TAGS_MANAGE'] }),
    item('/admin/composers', 'composers', 'users', { permissions: ['COMPOSERS_MANAGE'] }),
  ]),
  section('billing', [
    item('/admin/revenue', 'revenue', 'chart', { permissions: ['REVENUE_VIEW'] }),
    item('/admin/plans', 'plans', 'star', { permissions: ['PLANS_MANAGE', 'SUBSCRIPTIONS_MANAGE', 'REVENUE_VIEW'] }),
    item('/admin/member-plans', 'memberPlans', 'users', { permissions: ['SUBSCRIPTIONS_MANAGE', 'MEMBERS_VIEW'] }),
  ]),
  section('system', [
    item('/admin/ai-tasks', 'aiTasks', 'cpu', { permissions: ['AI_TASKS_MANAGE'] }),
    item('/admin/system', 'system', 'activity', { permissions: ['SYSTEM_MONITOR'] }),
    item('/admin/activity', 'audit', 'list', { permissions: ['AUDIT_VIEW'] }),
  ]),
];

/** Mục menu người này được thấy (theo quyền của vai trò); admin chưa tải xong thì chưa hiện mục nào. */
export const visibleMenu = (admin: Member | null) =>
  MENU.map((g) => ({
    section: g.section,
    items: g.items.filter((it) =>
      it.superOnly
        ? !!admin && isSuperAdminMember(admin)
        : !it.permissions || it.permissions.some((p) => hasAdminPermission(admin, p)),
    ),
  })).filter((g) => g.items.length > 0);
