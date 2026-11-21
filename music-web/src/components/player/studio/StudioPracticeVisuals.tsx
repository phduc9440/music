import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { StudioEventResult, StudioInputSource } from '../../../types';
import type { StudioVisualNote } from '../engine/studioSchedule';
import { t } from '../../../i18n/core';

const SEMITONE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const WHITE_PITCHES = new Set([0, 2, 4, 5, 7, 9, 11]);
export const STUDIO_PIANO_MIN_MIDI = 21;
export const STUDIO_PIANO_MAX_MIDI = 108;
const SEMITONE_COUNT = STUDIO_PIANO_MAX_MIDI - STUDIO_PIANO_MIN_MIDI + 1;
const WHITE_KEY_COUNT = Array.from({ length: SEMITONE_COUNT }, (_, offset) =>
  WHITE_PITCHES.has((STUDIO_PIANO_MIN_MIDI + offset) % 12),
).filter(Boolean).length;
const WATERFALL_WINDOW_MS = 4000;
const FEEDBACK_LIFETIME_MS = 700;
/** Hiệu ứng chấm điểm (chữ bay, cột sáng, tia) sống lâu hơn phần tô màu phím để kịp bay bổng. */
const JUDGE_LIFETIME_MS = 1100;
/** Tia sáng khi chơi hoàn hảo: góc và tầm bắn xen kẽ xa / gần cho tự nhiên. */
const SPARKS = Array.from({ length: 12 }, (_, i) => ({ angle: i * 30, distance: i % 2 === 0 ? 84 : 56 }));
/** Từ bao nhiêu nốt hoàn hảo liên tiếp thì cả vạch chơi lóe sáng. */
const COMBO_GLOW_MIN = 5;
/** Từ bao nhiêu nốt hoàn hảo liên tiếp thì nhãn hiện thêm ×n. */
const COMBO_MIN = 3;

export interface StudioVisualFeedback {
  midi: number;
  result: StudioEventResult;
  atMs: number;
  noteId: string | null;
  expectedMs: number | null;
}

interface VisualNoteProps {
  notes: StudioVisualNote[];
  elapsedMs: number;
  feedbackElapsedMs?: number;
  durationMs: number;
  loop: boolean;
  feedback: StudioVisualFeedback[];
  waitForInput?: boolean;
}

interface PianoProps {
  inputSource: StudioInputSource;
  active: boolean;
  busy: boolean;
  elapsedMs: number;
  feedback: StudioVisualFeedback[];
  onPlayNote: (midi: number, velocity?: number) => void;
  /** Nốt của bản nhạc, để phím sáng lên (màu tay) khi nốt rơi chạm vạch chơi, giống nốt "rơi vào" phím. */
  guideNotes?: StudioVisualNote[];
  /** Thời điểm của vùng nốt rơi (có thể khác elapsedMs khi chế độ chờ đang dừng ở một nốt). */
  guideElapsedMs?: number;
  guideDurationMs?: number;
  guideLoop?: boolean;
}

/** Nốt ngắn vẫn giữ phím sáng ít nhất chừng này để mắt kịp thấy. */
const GUIDE_MIN_MS = 160;

/** Các phím đang có nốt chạm vạch chơi, kèm tay chơi (để tô đúng màu tay). */
function soundingKeys(
  notes: StudioVisualNote[],
  elapsedMs: number,
  durationMs: number,
  loop: boolean,
): Map<number, 'LEFT' | 'RIGHT'> {
  const keys = new Map<number, 'LEFT' | 'RIGHT'>();
  if (notes.length === 0 || durationMs <= 0) return keys;
  for (const cycleOffset of visibleCycleOffsets(elapsedMs, durationMs, loop)) {
    for (const note of notes) {
      const start = note.expectedMs + cycleOffset;
      if (elapsedMs >= start && elapsedMs < start + Math.max(note.durationMs, GUIDE_MIN_MS)) {
        keys.set(note.midi, note.hand === 'LEFT' ? 'LEFT' : 'RIGHT');
      }
    }
  }
  return keys;
}

interface KeyLayout {
  midi: number;
  black: boolean;
  leftPercent: number;
  widthPercent: number;
  keyLeftPercent: number;
  keyWidthPercent: number;
}

function buildPianoKeys(): KeyLayout[] {
  const whiteWidth = 100 / WHITE_KEY_COUNT;
  let whiteIndex = -1;
  return Array.from({ length: SEMITONE_COUNT }, (_, offset) => {
    const midi = STUDIO_PIANO_MIN_MIDI + offset;
    const black = !WHITE_PITCHES.has(midi % 12);
    if (!black) whiteIndex += 1;
    const keyWidthPercent = black ? whiteWidth * 0.62 : whiteWidth;
    const keyLeftPercent = black ? (whiteIndex + 1) * whiteWidth - keyWidthPercent / 2 : whiteIndex * whiteWidth;
    const widthPercent = whiteWidth * (black ? 0.62 : 0.84);
    const leftPercent = black
      ? keyLeftPercent + (keyWidthPercent - widthPercent) / 2
      : keyLeftPercent + whiteWidth * 0.08;
    return { midi, black, leftPercent, widthPercent, keyLeftPercent, keyWidthPercent };
  });
}

const PIANO_KEYS = buildPianoKeys();

function noteName(midi: number): string {
  return `${SEMITONE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function resultClass(result: StudioEventResult): string {
  return result.toLowerCase().replace('_', '-');
}

function visibleCycleOffsets(elapsedMs: number, durationMs: number, loop: boolean): number[] {
  if (!loop || durationMs <= 0) return [0];
  const firstCycle = Math.max(0, Math.floor((elapsedMs - WATERFALL_WINDOW_MS) / durationMs));
  const lastCycle = Math.ceil((elapsedMs + WATERFALL_WINDOW_MS) / durationMs);
  return Array.from(
    { length: Math.max(1, lastCycle - firstCycle + 1) },
    (_, index) => (firstCycle + index) * durationMs,
  );
}

function notePosition(midi: number): KeyLayout | null {
  const offset = midi - STUDIO_PIANO_MIN_MIDI;
  return offset < 0 || offset >= PIANO_KEYS.length ? null : PIANO_KEYS[offset];
}

export function StudioWaterfall({
  notes,
  elapsedMs,
  feedbackElapsedMs = elapsedMs,
  durationMs,
  loop,
  feedback,
  waitForInput = false,
}: VisualNoteProps) {
  const cycles = visibleCycleOffsets(elapsedMs, durationMs, loop);
  const visibleNotes = cycles.flatMap((cycleOffset) =>
    notes
      .filter((note) => {
        const untilHit = note.expectedMs + cycleOffset - elapsedMs;
        return untilHit >= -180 && untilHit <= WATERFALL_WINDOW_MS;
      })
      .map((note) => ({ ...note, expectedMs: note.expectedMs + cycleOffset })),
  );
  const visibleFeedback = feedback.filter(
    (event) => feedbackElapsedMs - event.atMs >= 0 && feedbackElapsedMs - event.atMs <= FEEDBACK_LIFETIME_MS,
  );
  // chuỗi "hoàn hảo" liên tiếp tính đến từng lần chấm (theo thứ tự thời gian), để hiện ×3, ×4... trên nhãn
  const perfectCombo = new Map<StudioVisualFeedback, number>();
  let run = 0;
  for (const event of [...feedback].sort((a, b) => a.atMs - b.atMs)) {
    run = event.result === 'PERFECT' ? run + 1 : 0;
    perfectCombo.set(event, run);
  }
  const judged = feedback.filter(
    (event) => feedbackElapsedMs - event.atMs >= 0 && feedbackElapsedMs - event.atMs <= JUDGE_LIFETIME_MS,
  );
  // lần hoàn hảo gần nhất đạt chuỗi dài: cả vạch chơi lóe sáng (key theo thời điểm để hiệu ứng chạy lại mỗi lần)
  const comboGlow = judged.filter((event) => (perfectCombo.get(event) ?? 0) >= COMBO_GLOW_MIN).at(-1);

  return (
    <div className="studio-player__waterfall" role="img" aria-label={t('studioPlayer.waterfall.label')}>
      <div className="studio-player__waterfall-grid">
        {Array.from({ length: WHITE_KEY_COUNT - 1 }, (_, index) => (
          <span
            className="studio-player__waterfall-keyline"
            key={index}
            style={{ left: `${((index + 1) * 100) / WHITE_KEY_COUNT}%` }}
          />
        ))}
        {!waitForInput &&
          [1, 2, 3, 4].map((second) => (
            <div
              className="studio-player__waterfall-time"
              key={second}
              style={{ top: `${100 - (second * 100) / (WATERFALL_WINDOW_MS / 1000)}%` }}
            >
              <span>{t('studioPlayer.waterfall.seconds', { seconds: second })}</span>
            </div>
          ))}
        {visibleNotes.map((note, index) => {
          const position = notePosition(note.midi);
          if (!position) return null;
          const untilHit = note.expectedMs - elapsedMs;
          const height = Math.max(1.4, (note.durationMs / WATERFALL_WINDOW_MS) * 100);
          // nốt rơi từ trên xuống: mép dưới của nốt chạm vạch chơi (đáy khung) đúng lúc phải chơi, rồi trôi tiếp vào phím
          const top = Math.max(
            -height,
            Math.min(100, 100 - ((untilHit + note.durationMs) / WATERFALL_WINDOW_MS) * 100),
          );
          const event = feedback.find(
            (item) =>
              item.noteId === note.noteId &&
              (item.expectedMs === note.expectedMs || (waitForInput && item.expectedMs === null)) &&
              feedbackElapsedMs - item.atMs >= 0 &&
              feedbackElapsedMs - item.atMs <= FEEDBACK_LIFETIME_MS,
          );
          return (
            <span
              className={[
                'studio-player__falling-note',
                note.hand === 'LEFT' ? 'is-left-hand' : 'is-right-hand',
                note.scorable ? '' : 'is-unscored',
                // đang chạm vạch chơi: phát sáng như đáp xuống phím
                untilHit <= 0 && untilHit + Math.max(note.durationMs, GUIDE_MIN_MS) > 0 ? 'is-landing' : '',
                event ? `is-${resultClass(event.result)}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={`${note.noteId}-${note.expectedMs}-${index}`}
              style={{
                left: `${position.leftPercent}%`,
                width: `${position.widthPercent}%`,
                top: `${top}%`,
                height: `${Math.min(100, height)}%`,
              }}
              title={`${noteName(note.midi)} · ${t('studioPlayer.score.measureRange', {
                start: note.measure,
                end: note.measure,
              })}`}
            />
          );
        })}
        {visibleFeedback.map((event, index) => {
          const position = notePosition(event.midi);
          if (!position) return null;
          return (
            <span
              className={`studio-player__hit-flash is-${resultClass(event.result)}`}
              key={`flash-${event.noteId}-${event.expectedMs}-${event.atMs}-${index}`}
              style={{ left: `${position.leftPercent}%`, width: `${position.widthPercent}%` }}
            />
          );
        })}
        {/* hiệu ứng chấm điểm tại phím vừa chơi: cột sáng bắn lên dọc làn nốt, hai vòng sóng, tia sáng và nốt nhạc bay
            (hoàn hảo), chữ kết quả nảy lên rồi bay bổng. Chỉ để trang trí: vùng báo kết quả vẫn đọc cho trình đọc màn hình */}
        {judged.map((event, index) => {
          const position = notePosition(event.midi);
          if (!position) return null;
          const kind = resultClass(event.result);
          const perfect = event.result === 'PERFECT';
          const combo = perfect ? (perfectCombo.get(event) ?? 1) : 0;
          return (
            <span key={`judge-${event.noteId}-${event.expectedMs}-${event.atMs}-${index}`} aria-hidden="true">
              <span
                className={`studio-player__judge-beam is-${kind}`}
                style={{ left: `${position.keyLeftPercent}%`, width: `${position.keyWidthPercent}%` }}
              />
              <span
                className={`studio-player__judge is-${kind}`}
                style={{ left: `${position.leftPercent + position.widthPercent / 2}%` }}
              >
                <span className="studio-player__judge-ring" />
                <span className="studio-player__judge-ring is-late-ring" />
                {perfect &&
                  SPARKS.map((spark) => (
                    <span
                      className="studio-player__judge-spark"
                      key={spark.angle}
                      style={
                        {
                          '--spark-angle': `${spark.angle}deg`,
                          '--spark-distance': `${spark.distance}px`,
                        } as CSSProperties
                      }
                    />
                  ))}
                {perfect && (
                  <>
                    <span className="studio-player__judge-note is-left">♪</span>
                    <span className="studio-player__judge-note is-right">♫</span>
                  </>
                )}
                <span className="studio-player__judge-label">
                  {t(`studioPlayer.results.${event.result}`)}
                  {combo >= COMBO_MIN && <strong>×{combo}</strong>}
                </span>
              </span>
            </span>
          );
        })}
        {comboGlow && <span className="studio-player__combo-glow" key={`combo-${comboGlow.atMs}`} aria-hidden="true" />}
        <div className="studio-player__hit-line">
          <span>{t(waitForInput ? 'studioPlayer.waterfall.waiting' : 'studioPlayer.waterfall.hitLine')}</span>
        </div>
      </div>
    </div>
  );
}

export function StudioVirtualPiano({
  inputSource,
  active,
  busy,
  elapsedMs,
  feedback,
  onPlayNote,
  guideNotes = [],
  guideElapsedMs = elapsedMs,
  guideDurationMs = 0,
  guideLoop = false,
}: PianoProps) {
  const guide = soundingKeys(guideNotes, guideElapsedMs, guideDurationMs, guideLoop);
  const [pressedPointers, setPressedPointers] = useState<Record<number, number>>({});
  // bản sao đồng bộ của pressedPointers để xử lý pointermove liên tục mà không đợi React vẽ lại
  const pressedRef = useRef<Record<number, number>>({});
  const isInteractive = inputSource === 'TOUCH';
  const canPlay = active && !busy && isInteractive;

  const setPressed = (next: Record<number, number>) => {
    pressedRef.current = next;
    setPressedPointers(next);
  };

  /**
   * Phím đàn nằm dưới con trỏ (theo toạ độ, nên vẫn đúng khi con trỏ đang bị giữ bởi hàng phím) và lực đánh: bấm gần
   * mép dưới phím mạnh hơn gần mép trên, như đàn thật (cùng cách tính với bàn phím ở trang đăng nhập).
   */
  const keyAt = (event: PointerEvent<HTMLDivElement>): { midi: number; velocity: number } | null => {
    const el = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-midi]');
    if (!el || el.disabled || !event.currentTarget.contains(el)) return null;
    const rect = el.getBoundingClientRect();
    const depth = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { midi: Number(el.dataset.midi), velocity: 0.45 + 0.5 * depth };
  };

  // Giữ chuột / ngón tay rồi kéo qua các phím (glissando): hàng phím giữ con trỏ, mỗi lần con trỏ sang một phím mới thì
  // phím đó kêu và sáng lên. Nhiều ngón cùng lúc mỗi ngón một phím.
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canPlay) return;
    const hit = keyAt(event);
    if (!hit) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPressed({ ...pressedRef.current, [event.pointerId]: hit.midi });
    onPlayNote(hit.midi, hit.velocity);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!(event.pointerId in pressedRef.current)) return;
    const hit = keyAt(event);
    if (!hit || hit.midi === pressedRef.current[event.pointerId]) return;
    setPressed({ ...pressedRef.current, [event.pointerId]: hit.midi });
    onPlayNote(hit.midi, hit.velocity);
  };

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!(event.pointerId in pressedRef.current)) return;
    const next = { ...pressedRef.current };
    delete next[event.pointerId];
    setPressed(next);
  };

  return (
    <div
      className={`studio-player__piano${isInteractive ? '' : ' is-reference-only'}`}
      role="group"
      aria-label={t('studioPlayer.keyboard.label')}
    >
      <div
        className="studio-player__piano-keys"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onLostPointerCapture={releasePointer}
      >
        {PIANO_KEYS.filter((key) => !key.black).map((key) => {
          const event = [...feedback]
            .reverse()
            .find((item) => item.midi === key.midi && elapsedMs - item.atMs <= FEEDBACK_LIFETIME_MS);
          const pressed = Object.values(pressedPointers).includes(key.midi);
          return (
            <button
              type="button"
              className={[
                'studio-player__piano-key',
                'is-white',
                pressed ? 'is-pressed' : '',
                guide.has(key.midi) ? `is-guide is-guide-${guide.get(key.midi) === 'LEFT' ? 'left' : 'right'}` : '',
                event ? `is-${resultClass(event.result)}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={key.midi}
              style={{ left: `${key.keyLeftPercent}%`, width: `${key.keyWidthPercent}%` }}
              aria-label={noteName(key.midi)}
              title={noteName(key.midi)}
              data-midi={key.midi}
              disabled={!canPlay}
              // bàn phím máy tính (Enter / Space trên phím đang focus): click không đến từ chuột (detail 0)
              onClick={(clickEvent) => {
                if (clickEvent.detail === 0 && canPlay) onPlayNote(key.midi);
              }}
            >
              <span>{SEMITONE_NAMES[key.midi % 12]}</span>
              {key.midi % 12 === 0 && <strong>{Math.floor(key.midi / 12) - 1}</strong>}
            </button>
          );
        })}
        {PIANO_KEYS.filter((key) => key.black).map((key) => {
          const event = [...feedback]
            .reverse()
            .find((item) => item.midi === key.midi && elapsedMs - item.atMs <= FEEDBACK_LIFETIME_MS);
          const pressed = Object.values(pressedPointers).includes(key.midi);
          return (
            <button
              type="button"
              className={[
                'studio-player__piano-key',
                'is-black',
                pressed ? 'is-pressed' : '',
                guide.has(key.midi) ? `is-guide is-guide-${guide.get(key.midi) === 'LEFT' ? 'left' : 'right'}` : '',
                event ? `is-${resultClass(event.result)}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={key.midi}
              style={{ left: `${key.keyLeftPercent}%`, width: `${key.keyWidthPercent}%` }}
              aria-label={noteName(key.midi)}
              title={noteName(key.midi)}
              data-midi={key.midi}
              disabled={!canPlay}
              // bàn phím máy tính (Enter / Space trên phím đang focus): click không đến từ chuột (detail 0)
              onClick={(clickEvent) => {
                if (clickEvent.detail === 0 && canPlay) onPlayNote(key.midi);
              }}
            ></button>
          );
        })}
      </div>
    </div>
  );
}
