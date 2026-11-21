import { useEffect, useSyncExternalStore } from 'react';

import { SONGS } from '../home/songs';
import { playPianoNote } from '../../utils/pianoSynth';
import { createClickMelody, readSoundOn, writeSoundOn } from './clickMelody';

/*
 * "Bấm ra nhạc" trong app đã đăng nhập: mỗi cú bấm chơi nốt kế tiếp của một bài thuộc phạm vi công cộng (cùng danh sách
 * với hộp nhạc trang khách, components/home/songs.ts) bằng tiếng piano tổng hợp, kèm hợp âm đệm nhỏ; bấm liên tiếp thành
 * giai điệu. Người dùng tắt / bật bằng nút loa trên thanh trên (SoundToggle), lựa chọn nhớ trong trình duyệt.
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

/** Không phát tiếng khi bấm vào ô nhập chữ hoặc vào phần tử tự xử lý âm thanh (nút loa). */
const NO_SOUND = 'input,textarea,select,[contenteditable="true"],[data-no-click-sound]';

/** Gắn một lần ở khung trang (UserLayout, AdminLayout): nghe mọi cú bấm chuột trái / Enter trên nút. */
export function useClickMusic() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!soundOn || e.button !== 0) return;
      if ((e.target as Element | null)?.closest?.(NO_SOUND)) return;
      playClickNote();
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);
}
