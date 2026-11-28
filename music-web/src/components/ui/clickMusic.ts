import { useEffect, useSyncExternalStore } from 'react';

import { SONGS } from '../home/songs';
import { playPianoNote } from '../../utils/pianoSynth';
import { clickMusicAllowedAt, createClickMelody, readSoundOn, writeSoundOn } from './clickMelody';

/*
 * "Bấm ra nhạc" trong app đã đăng nhập: mỗi cú bấm chơi nốt kế tiếp của một bài thuộc phạm vi công cộng (cùng danh sách
 * với hộp nhạc trang khách, components/home/songs.ts) bằng tiếng piano tổng hợp, kèm hợp âm đệm nhỏ; bấm liên tiếp thành
 * giai điệu. Người dùng tắt / bật bằng nút loa nổi ở mép phải màn hình (SoundFab), lựa chọn nhớ trong trình duyệt. Các
 * trang có âm thanh riêng (soạn bản nhạc, trình phát, luyện tập...) không phát, xem `clickMusicAllowedAt`.
 */

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

let soundOn = typeof window === 'undefined' ? true : readSoundOn(storage());
const listeners = new Set<() => void>();
let melody: ReturnType<typeof createClickMelody> | null = null;

export const isClickSoundOn = () => soundOn;

export function setClickSoundOn(on: boolean) {
  soundOn = on;
  writeSoundOn(storage(), on);
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Trạng thái bật / tắt tiếng cho component React. */
export const useClickSoundOn = () => useSyncExternalStore(subscribe, isClickSoundOn, () => true);

/** Chơi nốt kế tiếp của giai điệu (giai điệu rõ, hợp âm đệm nhỏ hơn). */
export function playClickNote() {
  melody ??= createClickMelody(SONGS);
  const note = melody.next();
  if (!note) return;
  playPianoNote(note.midi, 0.5);
  for (const bass of note.bass) playPianoNote(bass, 0.2);
}

/** Không phát tiếng khi bấm vào ô nhập chữ, trình phát âm thanh hoặc phần tử tự xử lý âm thanh (nút loa). */
const NO_SOUND = 'input,textarea,select,audio,video,[contenteditable="true"],[data-no-click-sound]';

/** Đang có âm thanh / video phát trên trang (nghe thử file xuất...): không chen tiếng nốt vào. */
const mediaPlaying = (): boolean =>
  [...document.querySelectorAll<HTMLMediaElement>('audio,video')].some((m) => !m.paused && !m.muted);

/** Gắn một lần ở khung trang (UserLayout, AdminLayout): nghe mọi cú bấm chuột trái / Enter trên nút. */
export function useClickMusic() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!soundOn || e.button !== 0) return;
      if ((e.target as Element | null)?.closest?.(NO_SOUND)) return;
      if (!clickMusicAllowedAt(window.location.pathname) || mediaPlaying()) return;
      playClickNote();
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);
}
