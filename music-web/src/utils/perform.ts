import { ZOOM_DEFAULT, clampZoom } from './viewer';

/** Chế độ biểu diễn: cài đặt riêng của từng bài, chỉ lưu trên máy này. */
export const PERFORM_TRANSPOSE_MIN = -12;
export const PERFORM_TRANSPOSE_MAX = 12;

/** Số bài tải MusicXML cùng lúc. */
export const PERFORM_LOAD_CONCURRENCY = 3;

/** Thời gian hiện màn "Bài tiếp" trước khi tự chuyển bài (ms). */
export const PERFORM_INTERLUDE_MS = 3000;

export interface PerformSettings {
  transpose: number;
  zoom: number;
}

const DEFAULT_SETTINGS: PerformSettings = { transpose: 0, zoom: ZOOM_DEFAULT };

const settingsKey = (showId: string, itemId: string) => `perform:${showId}:${itemId}`;

export const clampTranspose = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(PERFORM_TRANSPOSE_MAX, Math.max(PERFORM_TRANSPOSE_MIN, Math.round(value)));
};

/** Đọc cài đặt đã lưu của bài; lỗi hoặc dữ liệu lạ thì dùng mặc định. */
export const loadPerformSettings = (showId: string, itemId: string): PerformSettings => {
  try {
    const raw = localStorage.getItem(settingsKey(showId, itemId));
    if (!raw) return DEFAULT_SETTINGS;
    const data = JSON.parse(raw) as Partial<PerformSettings>;
    return {
      transpose: typeof data.transpose === 'number' ? clampTranspose(data.transpose) : DEFAULT_SETTINGS.transpose,
      zoom: typeof data.zoom === 'number' ? clampZoom(data.zoom) : DEFAULT_SETTINGS.zoom,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

/** Lưu cài đặt của bài; bỏ qua nếu trình duyệt chặn localStorage. */
export const savePerformSettings = (showId: string, itemId: string, settings: PerformSettings): void => {
  try {
    localStorage.setItem(settingsKey(showId, itemId), JSON.stringify(settings));
  } catch {
    // không lưu được thì lần sau dùng mặc định
  }
};

/** Xin bật giữ sáng màn hình; trình duyệt không hỗ trợ hoặc từ chối thì trả null. */
export const requestWakeLock = async (): Promise<WakeLockSentinel | null> => {
  try {
    return (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    return null;
  }
};
