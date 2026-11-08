import { NO_LOOP, sanitizeLoop } from './loop';
import type { LoopSettings } from './loop';
import { EMPTY_MIXER, sanitizeMixer } from './mixer';
import type { MixerState } from './mixer';

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

export const MIN_TEMPO_PERCENT = 20;
export const MAX_TEMPO_PERCENT = 200;
export const DEFAULT_TEMPO_PERCENT = 100;

/** Làm tròn và kẹp tempo vào 20–200%; giá trị không hợp lệ thì về 100%. */
export function clampTempoPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TEMPO_PERCENT;
  return Math.min(MAX_TEMPO_PERCENT, Math.max(MIN_TEMPO_PERCENT, Math.round(value)));
}

/** Cài đặt riêng từng bản nhạc, lưu ở khóa `player:{scoreId}` (các nhóm loop, mixer sẽ thêm vào cùng đối tượng). */
export interface ScorePlayerSettings {
  /** Tempo (% so với tempo gốc). */
  tempoPercent: number;
  /** Mute / Solo / âm lượng theo track (chỉ gồm track khác mặc định). */
  mixer: MixerState;
  /** Đoạn lặp A-B (chỉ số ô từ 0). */
  loop: LoopSettings;
}

const scoreKey = (scoreId: string | number): string => `player:${scoreId}`;

const readScoreRecord = (scoreId: string | number): Record<string, unknown> => {
  try {
    const raw = localStorage.getItem(scoreKey(scoreId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export function loadScoreSettings(scoreId: string | number | null | undefined): ScorePlayerSettings {
  if (scoreId === null || scoreId === undefined)
    return { tempoPercent: DEFAULT_TEMPO_PERCENT, mixer: EMPTY_MIXER, loop: NO_LOOP };
  const record = readScoreRecord(scoreId);
  return {
    tempoPercent:
      typeof record.tempoPercent === 'number' ? clampTempoPercent(record.tempoPercent) : DEFAULT_TEMPO_PERCENT,
    mixer: sanitizeMixer(record.mixer),
    loop: sanitizeLoop(record.loop),
  };
}

/** Ghi đè các trường trong `patch`, giữ nguyên các trường khác đã lưu. */
export function saveScoreSettings(
  scoreId: string | number | null | undefined,
  patch: Partial<ScorePlayerSettings>,
): void {
  if (scoreId === null || scoreId === undefined) return;
  try {
    localStorage.setItem(scoreKey(scoreId), JSON.stringify({ ...readScoreRecord(scoreId), ...patch }));
  } catch {
    // không lưu được thì lần sau dùng mặc định
  }
}
