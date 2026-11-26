import type { StudioHandMode, StudioInputSource } from '../../../types';

/** Thiết lập Studio nhớ giữa các lần mở (T41, ST-13). Lưu ở trình duyệt; lỗi đọc/ghi thì dùng mặc định. */
export interface StudioSettings {
  mode: 'FREE_RUN' | 'WAIT';
  inputSource: StudioInputSource;
  handMode: StudioHandMode;
  tempoPercent: number;
  /** Độ trễ micro đo bằng hiệu chỉnh ở hộp thử micro (ms, ST-05); chưa hiệu chỉnh là 0. */
  micOffsetMs: number;
}

const KEY = 'scorewise.studio.settings';
const INPUTS: StudioInputSource[] = ['MIDI', 'KEYBOARD', 'TOUCH', 'MIC'];
const HANDS: StudioHandMode[] = ['BOTH', 'RIGHT_ONLY', 'LEFT_ONLY'];

/** Mặc định theo thiết bị: màn cảm ứng không có bàn phím thì bấm phím trên màn hình, còn lại dùng phím máy tính. */
export function defaultInputSource(): StudioInputSource {
  try {
    return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches
      ? 'TOUCH'
      : 'KEYBOARD';
  } catch {
    return 'KEYBOARD';
  }
}

export function loadStudioSettings(): StudioSettings {
  const fallback: StudioSettings = {
    mode: 'FREE_RUN',
    inputSource: defaultInputSource(),
    handMode: 'BOTH',
    tempoPercent: 100,
    micOffsetMs: 0,
  };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<StudioSettings>;
    const inputSource = INPUTS.includes(saved.inputSource as StudioInputSource)
      ? (saved.inputSource as StudioInputSource)
      : fallback.inputSource;
    const tempo = Number(saved.tempoPercent);
    return {
      // micro chỉ đi với Chạy tự do
      mode: saved.mode === 'WAIT' && inputSource !== 'MIC' ? 'WAIT' : 'FREE_RUN',
      inputSource,
      handMode: HANDS.includes(saved.handMode as StudioHandMode) ? (saved.handMode as StudioHandMode) : 'BOTH',
      tempoPercent: Number.isInteger(tempo) && tempo >= 20 && tempo <= 200 ? tempo : 100,
      micOffsetMs: clampOffset(Number(saved.micOffsetMs)),
    };
  } catch {
    return fallback;
  }
}

/** Độ trễ hiệu chỉnh hợp lệ: 0–500 ms, số lạ thì 0. */
export const clampOffset = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(500, Math.round(value))) : 0;

/** Ghi thiết lập; trường không truyền thì giữ giá trị đã lưu (ví dụ độ trễ micro chỉ đổi ở hộp thử micro). */
export function saveStudioSettings(settings: Partial<StudioSettings>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...loadStudioSettings(), ...settings }));
  } catch {
    // trình duyệt chặn lưu: lần sau dùng mặc định
  }
}
