/**
 * Phát âm bằng WebAudio (sóng triangle), không cần thư viện: dùng cho âm xem trước khi sửa và cho nút Phát cơ bản.
 * Nhánh playback-basic có thể thay bằng sampler.
 */
import { midiToFrequency } from './pitch';

const PREF_KEY = 'editor-preview-tone';
/** Thời lượng mỗi nốt của âm xem trước (giây) và khoảng cách giữa hai nhóm nốt liên tiếp. */
const PREVIEW_NOTE_S = 0.3;
const PREVIEW_STEP_S = 0.32;
/** Xem trước tối đa chừng này nhóm nốt (khoảng 6 giây) để vùng chọn lớn không kêu quá dài. */
const PREVIEW_MAX_GROUPS = 18;

let context: AudioContext | null = null;
let active: { osc: OscillatorNode; gain: GainNode }[] = [];

/** Một nhóm nốt phát cùng lúc, bắt đầu sau `at` giây kể từ lúc gọi. */
export interface ToneEvent {
  at: number;
  duration: number;
  midis: number[];
  /** Âm lượng 0–1; mặc định 0,8 giữ nguyên độ to cũ của âm xem trước. */
  gain?: number;
}

/** Âm lượng mặc định của một nhóm nốt (ứng với mức mf). */
const DEFAULT_TONE_GAIN = 0.8;

/** Đọc lựa chọn "Nghe khi sửa" đã lưu; mặc định bật. */
export const loadPreviewTonePref = (): boolean => {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
};

/** Lưu lựa chọn "Nghe khi sửa"; bỏ qua nếu trình duyệt chặn localStorage. */
export const savePreviewTonePref = (enabled: boolean): void => {
  try {
    localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // không lưu được thì lần sau dùng mặc định
  }
};

const getContext = (): AudioContext | null => {
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
};

/** Dừng ngay mọi âm đang phát hoặc đã hẹn giờ. */
export function stopAllTones(): void {
  for (const { osc, gain } of active) {
    try {
      gain.gain.cancelScheduledValues(0);
      gain.gain.setValueAtTime(0.0001, context?.currentTime ?? 0);
      osc.stop();
    } catch {
      // nốt đã dừng
    }
  }
  active = [];
}

/**
 * Hẹn giờ phát một chuỗi nhóm nốt; dừng chuỗi đang phát trước đó. Lỗi âm thanh (trình duyệt chặn, không có thiết bị)
 * được bỏ qua.
 */
export function playTones(events: readonly ToneEvent[]): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    stopAllTones();
    const base = ctx.currentTime + 0.03;
    for (const event of events) {
      const level =
        (0.28 * ((event.gain ?? DEFAULT_TONE_GAIN) / DEFAULT_TONE_GAIN)) / Math.sqrt(Math.max(1, event.midis.length));
      for (const midi of event.midis) {
        const start = base + event.at;
        const end = start + event.duration;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = midiToFrequency(midi);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(end + 0.02);
        active.push({ osc, gain });
        osc.onended = () => {
          active = active.filter((a) => a.osc !== osc);
        };
      }
    }
  } catch {
    // bỏ qua
  }
}

/**
 * Âm xem trước: phát lần lượt các nhóm nốt (mỗi nhóm là các nốt cùng thời điểm, phát cùng lúc), để nghe được cả
 * vùng đang chọn chứ không chỉ một nốt.
 */
export function playPreviewGroups(groups: readonly number[][]): void {
  const limited = groups.slice(0, PREVIEW_MAX_GROUPS);
  playTones(limited.map((midis, i) => ({ at: i * PREVIEW_STEP_S, duration: PREVIEW_NOTE_S, midis })));
}
