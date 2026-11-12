import type { TeamMember } from '../../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày từ hôm nay tới ngày (yyyy-MM-dd) theo giờ máy người xem; âm = đã qua. */
export function daysUntil(isoDate: string, now: number): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const today = new Date(now);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((new Date(y, m - 1, d).getTime() - startToday) / DAY_MS);
}

export const memberName = (m: Pick<TeamMember, 'fullName' | 'email'>) => m.fullName?.trim() || m.email;
