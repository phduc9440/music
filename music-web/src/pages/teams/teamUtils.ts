import { hasKey, t } from '../../i18n/core';
import type { TeamActivity, TeamMember } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày từ hôm nay tới ngày (yyyy-MM-dd) theo giờ máy người xem; âm = đã qua. */
export function daysUntil(isoDate: string, now: number): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const today = new Date(now);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((new Date(y, m - 1, d).getTime() - startToday) / DAY_MS);
}

export const memberName = (m: Pick<TeamMember, 'fullName' | 'email'>) => m.fullName?.trim() || m.email;

/** Câu của một dòng hoạt động theo ngôn ngữ đang dùng (vai trò, trạng thái được dịch). */
export function activityText(a: TeamActivity): string {
  const p = a.params ?? {};
  const translated: Record<string, string> = { ...p, actor: a.actorName ?? t('teams.activity.someone') };
  for (const key of ['role', 'from'] as const) {
    if (p[key] && hasKey(`teams.roles.${p[key]}`)) translated[key] = t(`teams.roles.${p[key]}`);
  }
  if (a.type === 'ITEM_STATUS_CHANGED') {
    translated.status = p.status ? t(`teams.status.${p.status}`) : '';
    translated.from = p.from ? t(`teams.status.${p.from}`) : '';
  }
  if (a.type === 'ITEM_ASSIGNED') {
    translated.arranger = p.arranger ?? t('teams.item.nobody');
    translated.reviewer = p.reviewer ?? t('teams.item.nobody');
  }
  const variant = a.type === 'INVITATION_SENT' && !p.email ? '_link' : '';
  return t(`teams.activity.${a.type}${variant}`, translated);
}
