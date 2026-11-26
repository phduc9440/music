import type { StudioHandMode, StudioInputSource } from '../../../types';

/** Thiết lập Studio nhớ giữa các lần mở (T41, ST-13). Lưu ở trình duyệt; lỗi đọc/ghi thì dùng mặc định. */
export interface StudioSettings {
  mode: 'FREE_RUN' | 'WAIT';
  inputSource: StudioInputSource;
  handMode: StudioHandMode;
  tempoPercent: number;
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
    };
  } catch {
    return fallback;
  }
}

export function saveStudioSettings(settings: StudioSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // trình duyệt chặn lưu: lần sau dùng mặc định
  }
}
