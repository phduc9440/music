import { hasKey, t } from '../i18n/core';
import type { AppNotification } from '../types';

/** Câu ngắn cho mã lỗi của tác vụ AI trong thông báo; mã lạ thì câu chung. */
function aiTaskErrorText(variant: string | undefined, code: string): string {
  if (variant === 'chords')
    return hasKey(`chords.taskErrors.${code}`) ? t(`chords.taskErrors.${code}`) : t('chords.failed');
  return hasKey(`upload.errors.${code}.title`) ? t(`upload.errors.${code}.title`) : t('upload.errors.GENERIC.title');
}

/**
 * Trang mở ra khi bấm thông báo tác vụ AI: số hóa xong → Kết quả, số hóa lỗi → Tiến độ, hợp âm xong → trình chỉnh sửa
 * nạp bản nháp hợp âm (chỉ người yêu cầu nhận), hợp âm lỗi → Chi tiết.
 */
export function aiTaskNotificationPath(n: AppNotification): string | null {
  if (!n.scoreId || (n.type !== 'AI_TASK_COMPLETED' && n.type !== 'AI_TASK_FAILED')) return null;
  if (n.params?.variant !== 'omr') {
    const draft = n.type === 'AI_TASK_COMPLETED' ? n.params?.suggestionId : null;
    return draft ? `/scores/${n.scoreId}/edit?aiChords=${encodeURIComponent(draft)}` : `/scores/${n.scoreId}`;
  }
  return `/scores/${n.scoreId}/${n.type === 'AI_TASK_COMPLETED' ? 'review' : 'processing'}`;
}

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
    // Đề xuất do hệ thống gửi (gợi ý hợp âm): tên người gửi dịch theo ngôn ngữ người đọc
    name: p.system ? t('suggestions.section.system') : (p.name ?? ''),
    level: p.level ? t(`notifications.levels.${p.level}`) : '',
    // Vai trò trong team (Team và Show) gửi dạng mã OWNER / MANAGER / ARRANGER / VIEWER
    role: p.role && hasKey(`teams.roles.${p.role}`) ? t(`teams.roles.${p.role}`) : (p.role ?? ''),
    // Tác vụ AI thất bại (OMR-02): mã lỗi dịch theo bảng lỗi của số hóa hoặc gợi ý hợp âm
    error: p.code ? aiTaskErrorText(p.variant, p.code) : '',
  });
  return p.reason ? t('notifications.withReason', { text, reason: p.reason }) : text;
}
