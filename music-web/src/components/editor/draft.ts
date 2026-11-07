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

/** Xóa bản nháp của các phiên bản khác `keepVersion` (nháp của phiên bản cũ không còn dùng được và chiếm dung lượng). */
export const purgeOtherDrafts = (scoreId: string, keepVersion: number): void => {
  try {
    const prefix = `draft:${scoreId}:`;
    const keep = keyOf(scoreId, keepVersion);
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && key !== keep) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    // bỏ qua
  }
};
