/** Cài đặt của Player lưu trong localStorage của trình duyệt; mọi thao tác đều bỏ qua lỗi khi trình duyệt chặn lưu trữ. */

export type SoundQuality = 'high' | 'light';

export interface PlayerSettings {
  /** Chất lượng mẫu âm piano: "high" (2 lớp lực, đủ nốt) hoặc "light" (cho mạng chậm). */
  quality: SoundQuality;
}

const KEY = 'player:settings';
const DEFAULTS: PlayerSettings = { quality: 'high' };

export function loadPlayerSettings(): PlayerSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PlayerSettings>;
    return { quality: parsed.quality === 'light' ? 'light' : 'high' };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePlayerSettings(settings: PlayerSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // không lưu được thì lần sau dùng mặc định
  }
}
