import { useState } from 'react';
import type { PointerEvent } from 'react';
import type { StudioEventResult, StudioInputSource } from '../../../types';
import type { StudioVisualNote } from '../engine/studioSchedule';
import { t } from '../../../i18n/core';

const SEMITONE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const WHITE_PITCHES = new Set([0, 2, 4, 5, 7, 9, 11]);
const OCTAVE_COUNT = 5;
const SEMITONE_COUNT = OCTAVE_COUNT * 12 + 1;
const WHITE_KEY_COUNT = OCTAVE_COUNT * 7 + 1;
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
  durationMs: number;
  loop: boolean;
  baseMidi: number;
  feedback: StudioVisualFeedback[];
}

interface PianoProps {
  baseMidi: number;
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

function getKeyLayout(baseMidi: number, offset: number): KeyLayout {
  const pitchClass = offset % 12;
  const octaveIndex = Math.floor(offset / 12);
  const whiteIndex = octaveIndex * 7 + [...WHITE_PITCHES].filter((pitch) => pitch < pitchClass).length;
  const whiteWidth = 100 / WHITE_KEY_COUNT;
  const black = !WHITE_PITCHES.has(pitchClass);
  const keyWidthPercent = black ? whiteWidth * 0.62 : whiteWidth;
  const keyLeftPercent = black ? whiteIndex * whiteWidth - keyWidthPercent / 2 : whiteIndex * whiteWidth;
  const widthPercent = whiteWidth * (black ? 0.62 : 0.84);
  const leftPercent = black
    ? whiteIndex * whiteWidth - widthPercent / 2
    : whiteIndex * whiteWidth + (whiteWidth - widthPercent) / 2;
  return {
    midi: baseMidi + offset,
    black,
    leftPercent,
    widthPercent,
    keyLeftPercent,
    keyWidthPercent,
  };
}

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

function notePosition(midi: number, baseMidi: number): KeyLayout | null {
  const offset = midi - baseMidi;
  return offset < 0 || offset >= SEMITONE_COUNT ? null : getKeyLayout(baseMidi, offset);
}

export function StudioWaterfall({ notes, elapsedMs, durationMs, loop, baseMidi, feedback }: VisualNoteProps) {
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
    (event) => elapsedMs - event.atMs >= 0 && elapsedMs - event.atMs <= FEEDBACK_LIFETIME_MS,
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
        {[1, 2, 3, 4].map((second) => (
          <div
            className="studio-player__waterfall-time"
            key={second}
            style={{ top: `${100 - (second * 100) / (WATERFALL_WINDOW_MS / 1000)}%` }}
          >
            <span>{t('studioPlayer.waterfall.seconds', { seconds: second })}</span>
          </div>
        ))}
        {visibleNotes.map((note, index) => {
          const position = notePosition(note.midi, baseMidi);
          if (!position) return null;
          const untilHit = note.expectedMs - elapsedMs;
          const height = Math.max(1.4, (note.durationMs / WATERFALL_WINDOW_MS) * 100);
          const top = Math.max(-height, Math.min(100, ((untilHit - note.durationMs) / WATERFALL_WINDOW_MS) * 100));
          const event = feedback.find(
            (item) =>
              item.noteId === note.noteId &&
              item.expectedMs === note.expectedMs &&
              elapsedMs - item.atMs >= 0 &&
              elapsedMs - item.atMs <= FEEDBACK_LIFETIME_MS,
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
          const position = notePosition(event.midi, baseMidi);
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
          <span>{t('studioPlayer.waterfall.hitLine')}</span>
        </div>
      </div>
    </div>
  );
}

export function StudioVirtualPiano({
  baseMidi,
  inputSource,
  active,
  busy,
  elapsedMs,
  feedback,
  onPlayNote,
}: PianoProps) {
  const [pressedPointers, setPressedPointers] = useState<Record<number, number>>({});
  const keys = Array.from({ length: SEMITONE_COUNT }, (_, offset) => getKeyLayout(baseMidi, offset));
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
        {keys
          .filter((key) => !key.black)
          .map((key) => {
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
        {keys
          .filter((key) => key.black)
          .map((key) => {
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
