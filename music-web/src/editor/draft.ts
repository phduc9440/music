/**
 * Bản nháp tự lưu trong localStorage (khóa `draft:{scoreId}:{version}`), để mở lại trang vẫn khôi phục được thay
 * đổi chưa lưu. Mọi thao tác bọc try/catch vì trình duyệt có thể chặn hoặc đầy dung lượng.
 */

/** Chu kỳ tự lưu nháp (ms). */
export const DRAFT_INTERVAL_MS = 30_000;

export interface Draft {
  xml: string;
  /** Thời điểm lưu nháp (epoch ms). */
  savedAt: number;
}

const keyOf = (scoreId: string, version: number): string => `draft:${scoreId}:${version}`;

/** Đọc bản nháp của đúng phiên bản; null nếu không có hoặc dữ liệu hỏng. */
export const loadDraft = (scoreId: string, version: number): Draft | null => {
  try {
    const raw = localStorage.getItem(keyOf(scoreId, version));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Draft>;
    return typeof data.xml === 'string' && typeof data.savedAt === 'number'
      ? { xml: data.xml, savedAt: data.savedAt }
      : null;
  } catch {
    return null;
  }
};

/** Lưu bản nháp; trả về false nếu không lưu được (ví dụ quá dung lượng). */
export const saveDraft = (scoreId: string, version: number, xml: string): boolean => {
  try {
    localStorage.setItem(keyOf(scoreId, version), JSON.stringify({ xml, savedAt: Date.now() } satisfies Draft));
    return true;
  } catch {
    return false;
  }
};

/** Xóa bản nháp của một phiên bản. */
export const clearDraft = (scoreId: string, version: number): void => {
  try {
    localStorage.removeItem(keyOf(scoreId, version));
  } catch {
    // bỏ qua
  }
};

const KEEP_MEASURE_KEY = 'editor-keep-measure';

/** Đọc tùy chọn "Giữ ô nhịp đủ phách" khi đổi trường độ; mặc định tắt (đổi thẳng). */
export const loadKeepMeasurePref = (): boolean => {
  try {
    return localStorage.getItem(KEEP_MEASURE_KEY) === 'on';
  } catch {
    return false;
  }
};

/** Lưu tùy chọn "Giữ ô nhịp đủ phách"; bỏ qua nếu trình duyệt chặn localStorage. */
export const saveKeepMeasurePref = (enabled: boolean): void => {
  try {
    localStorage.setItem(KEEP_MEASURE_KEY, enabled ? 'on' : 'off');
  } catch {
    // không lưu được thì lần sau dùng mặc định
  }
};
