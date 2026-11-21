/*
 * Logic thuần của "bấm ra nhạc": con trỏ giai điệu (mỗi cú bấm lấy nốt kế tiếp của một bài, hết bài thì sang bài sau) và
 * lựa chọn bật / tắt tiếng lưu trong trình duyệt. Không đụng Web Audio hay React để kiểm thử được bằng node:test.
 */

export interface MelodyNote {
  midi: number;
  /** Hợp âm đệm tay trái chơi cùng nốt (có thể rỗng). */
  bass: number[];
}

export interface MelodySong {
  notes: MelodyNote[];
}

/** Con trỏ chạy vòng qua các bài; bỏ qua bài không có nốt. Không bài nào có nốt thì trả null. */
export function createClickMelody(songs: MelodySong[]) {
  let song = 0;
  let note = 0;
  return {
    next(): MelodyNote | null {
      for (let tried = 0; tried <= songs.length; tried++) {
        const current = songs[song];
        if (current && note < current.notes.length) {
          const { midi, bass } = current.notes[note];
          note++;
          return { midi, bass };
        }
        song = (song + 1) % Math.max(songs.length, 1);
        note = 0;
      }
      return null;
    },
  };
}

/** Khóa lưu lựa chọn; giá trị "off" là đã tắt tiếng, không có hoặc giá trị khác là bật. */
export const SOUND_STORAGE_KEY = 'ui.clickSound';

interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Mặc định bật tiếng; trình duyệt chặn bộ nhớ (cửa sổ ẩn danh...) thì coi như bật. */
export function readSoundOn(storage: SoundStorage | null | undefined): boolean {
  try {
    return storage?.getItem(SOUND_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeSoundOn(storage: SoundStorage | null | undefined, on: boolean): void {
  try {
    storage?.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // bộ nhớ bị chặn: lựa chọn chỉ giữ trong phiên hiện tại
  }
}
