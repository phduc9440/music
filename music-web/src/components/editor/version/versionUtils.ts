import type { DiffErrorType, DiffMeasure, DiffStatus, ScoreVersion, VersionSource } from '../../../types/version';
import { getErrorCode, getSaveErrorMessage } from '../../../utils/score';

export const VERSION_SOURCE_LABELS: Record<VersionSource, string> = {
  EDITOR: 'Chỉnh sửa',
  OMR: 'Số hóa từ file',
  IMPORT: 'Nhập file',
  RESTORE: 'Khôi phục',
};

/** Nhãn mô tả nguồn của phiên bản, ví dụ "Khôi phục từ v2". */
export const versionSourceLabel = (v: ScoreVersion): string =>
  v.source === 'RESTORE' && v.restoredFrom ? `Khôi phục từ v${v.restoredFrom}` : VERSION_SOURCE_LABELS[v.source];

export const formatVersionSize = (bytes?: number | null): string =>
  bytes
    ? bytes >= 1048576
      ? `${(bytes / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`
    : '';

/** Thông báo lỗi khi xem hoặc khôi phục phiên bản (2014 có hộp thoại xung đột riêng nên không xử lý ở đây). */
export const getVersionErrorMessage = (err: unknown): string =>
  getErrorCode(err) === 2801 ? 'Phiên bản này không còn (chỉ giữ 20 phiên bản mới nhất)' : getSaveErrorMessage(err);

export const DIFF_STATUS_LABELS: Record<DiffStatus, string> = {
  same: 'Giữ nguyên',
  edited: 'Đã sửa',
  deleted: 'OMR sinh thừa, đã xóa',
  added: 'OMR bỏ sót, đã thêm',
};

export const DIFF_ERROR_LABELS: Record<DiffErrorType, string> = {
  PITCH: 'Sai cao độ',
  ACCIDENTAL: 'Sai dấu hóa',
  DURATION: 'Sai trường độ',
  TIMING: 'Lệch vị trí trong ô',
  EXTRA: 'Nốt thừa',
  MISSING: 'Nốt thiếu',
};

/** 0.1234 -> "12,3%". */
export const formatRate = (rate: number): string => `${(rate * 100).toFixed(1).replace('.', ',')}%`;

/** Nhãn hiển thị của một ô trong dải so sánh, ví dụ "12" hoặc "3→2" khi số ô đổi. */
export const diffMeasureLabel = (m: DiffMeasure): string =>
  m.base != null && m.target != null && m.base !== m.target
    ? `${m.base}→${m.target}`
    : String(m.target ?? m.base ?? '');

/** Mô tả một ô để hiện khi rê chuột: trạng thái và từng lỗi nốt. */
export const diffMeasureTitle = (m: DiffMeasure): string => {
  const lines = [`Ô ${diffMeasureLabel(m)}: ${DIFF_STATUS_LABELS[m.status]}`];
  for (const e of m.errors) {
    const detail = e.base && e.target ? `${e.base} → ${e.target}` : (e.base ?? e.target ?? '');
    lines.push(`${DIFF_ERROR_LABELS[e.type]}${detail ? `: ${detail}` : ''} (khuông ${e.staff}, phách ${e.onset + 1})`);
  }
  return lines.join('\n');
};

/** Thông báo lỗi khi so sánh phiên bản. */
export const getDiffErrorMessage = (err: unknown): string => {
  switch (getErrorCode(err)) {
    case 2901:
      return 'Không có phiên bản do nhận diện sinh ra để so sánh (bản nhạc không từ OMR hoặc đã quá 20 phiên bản)';
    case 2902:
      return 'Không thể so sánh một phiên bản với chính nó';
    case 2903:
      return 'Không so sánh được hai phiên bản này (MusicXML không đọc được)';
    case 2103:
      return 'Dịch vụ nhận diện tạm thời không khả dụng, vui lòng thử lại sau';
    default:
      return getVersionErrorMessage(err);
  }
};
