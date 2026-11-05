/**
 * Phát âm bằng WebAudio cho nút Phát và âm xem trước khi sửa. Âm sắc do `instruments.ts` dựng (piano, đàn dây, sáo...).
 *
 * Lịch phát được hẹn giờ DẦN (cửa sổ nhìn trước vài giây) thay vì hẹn một lần cả bản nhạc, để bản dài hàng nghìn nốt
 * không làm đơ trình duyệt và bấm Dừng thì dừng ngay.
 */
import { DEFAULT_INSTRUMENT, scheduleVoice } from './instruments';
import type { InstrumentId, Voice } from './instruments';

const PREF_KEY = 'editor-preview-tone';
/** Thời lượng mỗi nốt của âm xem trước (giây) và khoảng cách giữa hai nhóm nốt liên tiếp. */
const PREVIEW_NOTE_S = 0.3;
const PREVIEW_STEP_S = 0.32;
/** Xem trước tối đa chừng này nhóm nốt (khoảng 6 giây) để vùng chọn lớn không kêu quá dài. */
const PREVIEW_MAX_GROUPS = 18;
/** Hẹn giờ trước các nốt sắp tới trong khoảng này (giây), kiểm tra lại sau mỗi `TICK_MS`. */
const LOOKAHEAD_S = 2.5;
const TICK_MS = 100;

let context: AudioContext | null = null;
let voices: Voice[] = [];
let timer: number | undefined;

/** Một nhóm nốt phát cùng lúc, bắt đầu sau `at` giây kể từ lúc gọi. */
export interface ToneEvent {
  at: number;
  duration: number;
  midis: number[];
  /** Âm lượng 0–1; mặc định 0,8 (mf). */
  gain?: number;
  /** Nhạc cụ; mặc định piano. */
  instrument?: InstrumentId;
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
  window.clearTimeout(timer);
  timer = undefined;
  for (const voice of voices) voice.kill();
  voices = [];
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
    const queue = [...events].sort((a, b) => a.at - b.at);
    const base = ctx.currentTime + 0.05;
    let next = 0;

    const pump = () => {
      try {
        const horizon = ctx.currentTime - base + LOOKAHEAD_S;
        while (next < queue.length && queue[next].at <= horizon) {
          const event = queue[next++];
          // Hợp âm nhiều nốt hơi nhỏ hơn từng nốt đơn để tổng không vọt lên
          const level = (event.gain ?? DEFAULT_TONE_GAIN) * (event.midis.length > 1 ? 0.85 : 1);
          for (const midi of event.midis) {
            // Nốt đã quá hạn (tab bị treo) vẫn phát từ "bây giờ" thay vì bị bỏ
            const start = Math.max(base + event.at, ctx.currentTime);
            voices.push(
              scheduleVoice(ctx, {
                instrument: event.instrument ?? DEFAULT_INSTRUMENT,
                midi,
                start,
                duration: event.duration,
                level,
              }),
            );
          }
        }
        voices = voices.filter((v) => v.endsAt > ctx.currentTime);
        if (next < queue.length) timer = window.setTimeout(pump, TICK_MS);
      } catch {
        // bỏ qua
      }
    };
    pump();
  } catch {
    // bỏ qua
  }
}

/**
 * Âm xem trước: phát lần lượt các nhóm nốt (mỗi nhóm là các nốt cùng thời điểm, phát cùng lúc), để nghe được cả
 * vùng đang chọn chứ không chỉ một nốt.
 */
export function playPreviewGroups(groups: readonly number[][], instrument?: InstrumentId): void {
  const limited = groups.slice(0, PREVIEW_MAX_GROUPS);
  playTones(limited.map((midis, i) => ({ at: i * PREVIEW_STEP_S, duration: PREVIEW_NOTE_S, midis, instrument })));
}
