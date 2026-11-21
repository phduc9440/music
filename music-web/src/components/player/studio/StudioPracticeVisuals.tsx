import { useState } from 'react';
import type { PointerEvent } from 'react';
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
  onPlayNote: (midi: number) => void;
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
          const top = Math.max(-height, Math.min(100, ((untilHit - note.durationMs) / WATERFALL_WINDOW_MS) * 100));
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
              key={`${event.noteId}-${event.expectedMs}-${event.atMs}-${index}`}
              style={{ left: `${position.leftPercent}%`, width: `${position.widthPercent}%` }}
            />
          );
        })}
        <div className="studio-player__hit-line">
          <span>{t(waitForInput ? 'studioPlayer.waterfall.waiting' : 'studioPlayer.waterfall.hitLine')}</span>
        </div>
      </div>
    </div>
  );
}

export function StudioVirtualPiano({ inputSource, active, busy, elapsedMs, feedback, onPlayNote }: PianoProps) {
  const [pressedPointers, setPressedPointers] = useState<Record<number, number>>({});
  const isInteractive = inputSource === 'TOUCH';

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, midi: number) => {
    if (!active || busy || !isInteractive) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPressedPointers((current) => ({ ...current, [event.pointerId]: midi }));
    onPlayNote(midi);
  };

  const releasePointer = (event: PointerEvent<HTMLButtonElement>) => {
    setPressedPointers((current) => {
      if (!(event.pointerId in current)) return current;
      const next = { ...current };
      delete next[event.pointerId];
      return next;
    });
  };

  return (
    <div
      className={`studio-player__piano${isInteractive ? '' : ' is-reference-only'}`}
      role="group"
      aria-label={t('studioPlayer.keyboard.label')}
    >
      <div className="studio-player__piano-keys">
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
                event ? `is-${resultClass(event.result)}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={key.midi}
              style={{ left: `${key.keyLeftPercent}%`, width: `${key.keyWidthPercent}%` }}
              aria-label={noteName(key.midi)}
              title={noteName(key.midi)}
              disabled={!active || busy || !isInteractive}
              onPointerDown={(pointerEvent) => handlePointerDown(pointerEvent, key.midi)}
              onPointerUp={releasePointer}
              onPointerCancel={releasePointer}
              onLostPointerCapture={releasePointer}
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
                event ? `is-${resultClass(event.result)}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={key.midi}
              style={{ left: `${key.keyLeftPercent}%`, width: `${key.keyWidthPercent}%` }}
              aria-label={noteName(key.midi)}
              title={noteName(key.midi)}
              disabled={!active || busy || !isInteractive}
              onPointerDown={(pointerEvent) => handlePointerDown(pointerEvent, key.midi)}
              onPointerUp={releasePointer}
              onPointerCancel={releasePointer}
              onLostPointerCapture={releasePointer}
            ></button>
          );
        })}
      </div>
    </div>
  );
}
