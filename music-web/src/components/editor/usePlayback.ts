/** Hook nút Phát / Dừng: nghe cả bản nhạc, hoặc từ nốt đang chọn, với nhạc cụ chọn riêng cho từng part. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { detectInstrument, partLabel } from './instruments';
import type { InstrumentId } from './instruments';
import { buildPlayback } from './playback';
import { playTones, stopAllTones } from './previewTone';
import type { ScoreDocument } from './ScoreDocument';

/** Nhạc cụ của một part để hiện trong menu "Nhạc cụ". */
export interface PartInstrument {
  index: number;
  label: string;
  instrument: InstrumentId;
  /** true nếu người dùng đã chọn tay (false = tự nhận diện từ file). */
  custom: boolean;
}

export interface Playback {
  playing: boolean;
  /** Bắt đầu phát (từ nốt đầu của `fromIds` nếu có), hoặc dừng nếu đang phát. */
  toggle: (fromIds: ReadonlySet<string>) => void;
  stop: () => void;
  /** Nhạc cụ hiện tại của từng part. */
  parts: PartInstrument[];
  /** Đổi nhạc cụ của một part; `null` để về lại nhạc cụ tự nhận diện từ file. */
  setInstrument: (partIndex: number, instrument: InstrumentId | null) => void;
}

/**
 * @param doc tài liệu đang xem hoặc sửa; lịch phát luôn dựng lại từ DOM hiện tại nên nghe đúng nốt vừa sửa
 * @param fallbackBpm tempo của bản nhạc khi file không khai báo
 */
export function usePlayback(doc: ScoreDocument, fallbackBpm: number): Playback {
  const [playing, setPlaying] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, InstrumentId>>({});
  const timerRef = useRef<number | undefined>(undefined);

  const parts: PartInstrument[] = Array.from({ length: doc.partCount }, (_, index) => ({
    index,
    label: partLabel(doc, index),
    instrument: overrides[index] ?? detectInstrument(doc, index),
    custom: overrides[index] !== undefined,
  }));

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
        .map((n) => ({
          at: n.time - offset,
          duration: Math.max(0.08, n.duration),
          midis: [n.midi],
          gain: n.gain,
          instrument: overrides[n.part] ?? detectInstrument(doc, n.part),
        }));
      if (events.length === 0) return;
      playTones(events);
      setPlaying(true);
      timerRef.current = window.setTimeout(() => setPlaying(false), (plan.total - offset) * 1000 + 1500);
    },
    [playing, doc, fallbackBpm, stop, overrides],
  );

  const setInstrument = useCallback((partIndex: number, instrument: InstrumentId | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (instrument === null) delete next[partIndex];
      else next[partIndex] = instrument;
      return next;
    });
  }, []);

  useEffect(() => stop, [stop]);

  return { playing, toggle, stop, parts, setInstrument };
}
