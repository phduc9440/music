import type { DiffErrorType, DiffMeasure, DiffStatus, ScoreVersion } from '../../../types/version';
import { getErrorCode, getSaveErrorMessage } from '../../../utils/score';
import { t } from '../../../i18n/core';

/** Nhãn mô tả nguồn của phiên bản, ví dụ "Khôi phục từ v2". */
export const versionSourceLabel = (v: ScoreVersion): string =>
  v.source === 'RESTORE' && v.restoredFrom
    ? t('editor.version.restoredFrom', { version: v.restoredFrom })
    : t(`editor.version.source.${v.source}`);

export const formatVersionSize = (bytes?: number | null): string =>
  bytes
    ? bytes >= 1048576
      ? `${(bytes / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`
    : '';

/** Thông báo lỗi khi xem hoặc khôi phục phiên bản (2014 có hộp thoại xung đột riêng nên không xử lý ở đây). */
export const getVersionErrorMessage = (err: unknown): string =>
  getErrorCode(err) === 2801 ? t('editor.version.gone') : getSaveErrorMessage(err);

export const diffStatusLabel = (status: DiffStatus): string => t(`editor.version.status.${status}`);

export const diffErrorLabel = (type: DiffErrorType): string => t(`editor.version.error.${type}`);

/** 0.1234 -> "12,3%". */
export const formatRate = (rate: number): string => `${(rate * 100).toFixed(1).replace('.', ',')}%`;

/** Nhãn hiển thị của một ô trong dải so sánh, ví dụ "12" hoặc "3→2" khi số ô đổi. */
export const diffMeasureLabel = (m: DiffMeasure): string =>
  m.base != null && m.target != null && m.base !== m.target
    ? `${m.base}→${m.target}`
    : String(m.target ?? m.base ?? '');

/** Mô tả một ô để hiện khi rê chuột: trạng thái và từng lỗi nốt. */
export const diffMeasureTitle = (m: DiffMeasure): string => {
  const lines = [t('editor.version.cellTitle', { label: diffMeasureLabel(m), status: diffStatusLabel(m.status) })];
  for (const e of m.errors) {
    const detail = e.base && e.target ? `${e.base} → ${e.target}` : (e.base ?? e.target ?? '');
    lines.push(
      t('editor.version.errorLine', {
        type: diffErrorLabel(e.type),
        detail: detail ? `: ${detail}` : '',
        staff: e.staff,
        beat: e.onset + 1,
      }),
    );
  }
  return lines.join('\n');
};

/** Thông báo lỗi khi so sánh phiên bản. */
export const getDiffErrorMessage = (err: unknown): string => {
  switch (getErrorCode(err)) {
    case 2901:
      return t('editor.version.diff.2901');
    case 2902:
      return t('editor.version.diff.2902');
    case 2903:
      return t('editor.version.diff.2903');
    case 2103:
      return t('editor.version.diff.2103');
    default:
      return getVersionErrorMessage(err);
  }
};
