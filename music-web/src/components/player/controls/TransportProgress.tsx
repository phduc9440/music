import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { LoopSegment } from './loop';
import type { Timeline } from './timeline';
import { measureOrderAt } from './timeline';

const MAX_TICKS = 160;

interface Props {
  timeline: Timeline;
  /** Vị trí hiện tại (giây). */
  position: number;
  disabled?: boolean;
  onSeek: (seconds: number) => void;
  /** Các đoạn A-B tô trên thanh (giây ở tempo gốc). */
  loopSegments?: readonly LoopSegment[];
  /** Đang bật lặp (tô đậm); tắt thì tô nhạt nét đứt. */
  loopOn?: boolean;
}

/** Thanh tiến trình có thể kéo: thả để nhảy tới đầu ô nhịp gần nhất; hỗ trợ bàn phím (←/→, Home, End). */
export function TransportProgress({ timeline, position, disabled, onSeek, loopSegments = [], loopOn = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const total = Math.max(timeline.total, 0.001);
  const shown = drag ?? position;
  const order = measureOrderAt(timeline, shown);
  const count = timeline.measures.length;

  const timeAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * total;
  };
  const snap = (seconds: number): number => timeline.measures[measureOrderAt(timeline, seconds)]?.start ?? 0;

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(timeAt(e.clientX));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag !== null) setDrag(timeAt(e.clientX));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const target = snap(timeAt(e.clientX));
    setDrag(null);
    onSeek(target);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const move = (delta: number) => {
      e.preventDefault();
      e.stopPropagation();
      const next = Math.min(count - 1, Math.max(0, order + delta));
      onSeek(timeline.measures[next]?.start ?? 0);
    };
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') move(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') move(-1);
    else if (e.key === 'Home') move(-count);
    else if (e.key === 'End') move(count);
  };

  const ticks = count <= MAX_TICKS ? timeline.measures.slice(1) : [];

  return (
    <div
      ref={trackRef}
      className={`pl-progress${disabled ? ' pl-progress--disabled' : ''}${drag !== null ? ' pl-progress--drag' : ''}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Vị trí phát"
      aria-valuemin={1}
      aria-valuemax={Math.max(count, 1)}
      aria-valuenow={order + 1}
      aria-valuetext={`Ô ${order + 1} trên ${count}`}
      aria-disabled={disabled}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKey}
    >
      <div className="pl-progress__rail">
        <div className="pl-progress__fill" style={{ width: `${Math.min(100, (shown / total) * 100)}%` }} />
        {loopSegments.map((s) => (
          <i
            key={s.startOrder}
            className={`pl-progress__loop${loopOn ? '' : ' pl-progress__loop--off'}`}
            style={{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        {ticks.map((m) => (
          <i key={m.order} className="pl-progress__tick" style={{ left: `${(m.start / total) * 100}%` }} />
        ))}
      </div>
      <div className="pl-progress__thumb" style={{ left: `${Math.min(100, (shown / total) * 100)}%` }} />
    </div>
  );
}
