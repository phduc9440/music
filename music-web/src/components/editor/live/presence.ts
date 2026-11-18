/** Tiện ích hiển thị người cùng sửa (ảnh đại diện chữ cái, vị trí đang chọn). */
import { t } from '../../../i18n/core';
import type { LiveParticipant } from '../../../types';

/** Tên hiển thị của một người; tài khoản chưa đặt họ tên thì máy chủ gửi `name` rỗng/null. */
export const displayName = (p: Pick<LiveParticipant, 'name'>): string =>
  (p.name ?? '').trim() || t('live.presence.anonymous');

/** Hai chữ cái đầu của tên để làm ảnh đại diện (ví dụ "Đỗ Tuấn Nghĩa" → "TN", "Linh" → "L"). */
export const initialsOf = (name: string | null | undefined): string => {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const pick = words.length === 1 ? [words[0]] : words.slice(-2);
  return pick.map((w) => w.charAt(0).toUpperCase()).join('');
};

/** Màu (0..7) của một người, khớp `--ui-live-N`. */
export const colorOf = (p: Pick<LiveParticipant, 'colorIndex'>): number => ((p.colorIndex % 8) + 8) % 8;

/** Số ô tối đa vẽ viền cho một người (chọn cả bài thì chỉ vẽ phần đầu, tránh phủ kín bản nhạc). */
export const MAX_PRESENCE_MEASURES = 48;
