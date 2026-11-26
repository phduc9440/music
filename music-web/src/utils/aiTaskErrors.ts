import { EXPORT_TASK_TYPES, translateTaskError } from '../components/export/exportUtils';
import { hasKey, t } from '../i18n/core';
import type { AiTaskInfo } from '../types';
import { OMR_TASK_TYPE, describeTaskError, parseTaskError } from './omr';

/**
 * Lỗi của tác vụ theo ngôn ngữ người dùng (OMR-09, A-03): xuất file theo export.taskErrors, số hóa theo upload.errors
 * (kèm chi tiết như số trang), gợi ý hợp âm theo chords.taskErrors; không hiện mã kỹ thuật như "PAGE_UNREADABLE: trang 3".
 * Dùng chung cho bảng tác vụ ở trang chi tiết và trang Tác vụ AI của quản trị viên.
 */
export const aiTaskErrorText = (task: Pick<AiTaskInfo, 'taskType' | 'status' | 'errorMessage'>): string => {
  const message = task.errorMessage ?? '';
  if (EXPORT_TASK_TYPES.includes(task.taskType)) return translateTaskError(message);
  if (task.taskType === OMR_TASK_TYPE) {
    const error = describeTaskError(task as AiTaskInfo);
    return error.detail ? `${error.title} (${error.detail})` : error.title;
  }
  const { code } = parseTaskError(message);
  if (task.taskType === 'CHORD_GENERATION') {
    if (task.status === 'CANCELLED') return t('chords.cancelled');
    return hasKey(`chords.taskErrors.${code}`) ? t(`chords.taskErrors.${code}`) : t('chords.failed');
  }
  return message;
};
