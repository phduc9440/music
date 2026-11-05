/**
 * Âm xem trước khi đổi cao độ: một nốt sóng triangle ngắn (~0,3 giây) bằng WebAudio, không cần thư viện. Nhánh
 * playback-basic sẽ thay bằng sampler.
 */
import { midiToFrequency } from './pitch';

const PREF_KEY = 'editor-preview-tone';
const DURATION_S = 0.3;

let context: AudioContext | null = null;

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

/** Phát thử một nốt theo số MIDI. Lỗi âm thanh (trình duyệt chặn, không có thiết bị) được bỏ qua. */
export function playPreviewTone(midi: number): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFrequency(midi);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + DURATION_S);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + DURATION_S + 0.02);
  } catch {
    // bỏ qua
  }
}
