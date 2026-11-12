import { hasKey, t } from '../i18n/core';
import type { AppNotification } from '../types';

/**
 * Câu của một thông báo theo ngôn ngữ đang dùng: dựng từ loại thông báo và params (chuỗi ở locales, nhóm notifications).
 * Thông báo cũ chưa có params, thông báo tự do của quản trị viên (ANNOUNCEMENT) và loại chưa có bản dịch thì hiện
 * nguyên câu tiếng Việt backend đã lưu trong message.
 */
export function notificationText(n: AppNotification): string {
  const p = n.params;
  if (!p || n.type === 'ANNOUNCEMENT') return n.message;
  const key = `notifications.${n.type}${p.variant ? `.${p.variant}` : ''}`;
  if (!hasKey(key)) return n.message;
  const text = t(key, {
    ...p,
    level: p.level ? t(`notifications.levels.${p.level}`) : '',
    // Vai trò trong team (Team và Show) gửi dạng mã OWNER / MANAGER / ARRANGER / VIEWER
    role: p.role && hasKey(`teams.roles.${p.role}`) ? t(`teams.roles.${p.role}`) : (p.role ?? ''),
  });
  return p.reason ? t('notifications.withReason', { text, reason: p.reason }) : text;
}
