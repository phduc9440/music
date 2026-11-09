import type { ScoreVersion, VersionSource } from '../../types/version';
import { getErrorCode, getSaveErrorMessage } from '../../utils/score';

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
