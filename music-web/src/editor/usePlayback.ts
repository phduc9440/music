/** Hook nút Phát / Dừng: nghe thử cả bản nhạc, hoặc từ nốt đang chọn, bằng âm triangle của WebAudio. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildPlayback } from './playback';
import { playTones, stopAllTones } from './previewTone';
import type { ScoreDocument } from './ScoreDocument';

export interface Playback {
  playing: boolean;
  /** Bắt đầu phát (từ nốt đầu của `fromIds` nếu có), hoặc dừng nếu đang phát. */
  toggle: (fromIds: ReadonlySet<string>) => void;
  stop: () => void;
}

/**
 * @param doc tài liệu đang xem hoặc sửa; lịch phát luôn dựng lại từ DOM hiện tại nên nghe đúng nốt vừa sửa
 * @param fallbackBpm tempo của bản nhạc khi file không khai báo
 */
export function usePlayback(doc: ScoreDocument, fallbackBpm: number): Playback {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    window.clearTimeout(timerRef.current);
    stopAllTones();
    setPlaying(false);
  }, []);

  const toggle = useCallback(
    (fromIds: ReadonlySet<string>) => {
      if (playing) {
        stop();
        return;
      }
      const plan = buildPlayback(doc, fallbackBpm);
      const starts = plan.notes.filter((n) => fromIds.has(n.id)).map((n) => n.time);
      const offset = starts.length > 0 ? Math.min(...starts) : 0;
      const events = plan.notes
        .filter((n) => n.time >= offset - 1e-6)
        .map((n) => ({ at: n.time - offset, duration: Math.max(0.08, n.duration), midis: [n.midi] }));
      if (events.length === 0) return;
      playTones(events);
      setPlaying(true);
      timerRef.current = window.setTimeout(() => setPlaying(false), (plan.total - offset) * 1000 + 400);
    },
    [playing, doc, fallbackBpm, stop],
  );

  useEffect(() => stop, [stop]);

  return { playing, toggle, stop };
}
