/**
 * Cửa sổ chấm mặc định: lệch ≤ 60 ms là hoàn hảo, ≤ 150 ms là sớm / trễ, quá nữa mà chưa chơi thì bỏ lỡ. Rộng hơn mức
 * 40 / 100 cũ vì nốt rơi chỉ vẽ lại mỗi 40 ms và đàn chạm có độ trễ: bấm đúng phím hơi sớm trước đây bị ghi "sai nốt"
 * rồi nốt đó lại bị "bỏ lỡ" (hai nhãn cho một lần bấm).
 */
export const DEFAULT_TOLERANCE_WINDOW_MS = 150;
export const DEFAULT_PERFECT_WINDOW_MS = 60;
/** Nốt dài được chơi muộn đến nửa độ dài của nó (nửa thanh nốt trôi qua vạch), nhưng không quá mức này. */
export const MAX_LATE_WINDOW_MS = 500;

export type StudioHand = 'LEFT' | 'RIGHT';
export type StudioNoteEventResult = 'PERFECT' | 'EARLY' | 'LATE' | 'WRONG_PITCH' | 'MISSED';

export interface ExpectedPracticeNote {
  noteId: string;
  measure: number;
  hand: StudioHand | null;
  midi: number;
  expectedMs: number;
  /** Độ dài nốt (ms), tùy chọn: dùng để nới thời gian được chơi muộn lên nửa độ dài. */
  durationMs?: number;
}

export interface PlayedPracticeNote {
  midi: number;
  playedMs: number;
  hand?: StudioHand | null;
}

export interface PracticeNoteEvent {
  seq: number;
  noteId: string | null;
  measure: number | null;
  hand: StudioHand | null;
  expectedMidi: number | null;
  playedMidi: number | null;
  expectedMs: number | null;
  playedMs: number | null;
  deltaMs: number | null;
  result: StudioNoteEventResult;
}

export interface FreeRunScorerOptions {
  toleranceWindowMs?: number;
  perfectWindowMs?: number;
}

interface ScheduledNote extends ExpectedPracticeNote {
  order: number;
  /** Chơi muộn tối đa bao lâu sau expectedMs thì còn tính (không phải bỏ lỡ). */
  lateWindowMs: number;
}

const isStudioHand = (hand: unknown): hand is StudioHand => hand === 'LEFT' || hand === 'RIGHT';

const compareScheduledNotes = (left: ScheduledNote, right: ScheduledNote): number =>
  left.expectedMs - right.expectedMs || left.order - right.order;

const normalizeMidi = (midi: number): number => {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError('MIDI pitch must be an integer from 0 to 127');
  }
  return midi;
};

const normalizeTime = (timeMs: number, allowNegative: boolean): number => {
  if (!Number.isFinite(timeMs) || (!allowNegative && timeMs < 0)) {
    throw new RangeError('Note time must be a finite number of milliseconds');
  }
  const rounded = Math.round(timeMs);
  if (!Number.isSafeInteger(rounded)) {
    throw new RangeError('Note time exceeds the supported range');
  }
  return rounded;
};

export class FreeRunScorer {
  private readonly toleranceWindowMs: number;
  private readonly perfectWindowMs: number;
  private pending: ScheduledNote[] = [];
  private pendingStart = 0;
  private consumed = new Set<number>();
  private maxLateWindowMs: number;
  private nextOrder = 0;
  private nextSeq = 0;
  private currentTimeMs: number | null = null;
  private finished = false;

  constructor(options: FreeRunScorerOptions = {}) {
    const toleranceWindowMs = options.toleranceWindowMs ?? DEFAULT_TOLERANCE_WINDOW_MS;
    const perfectWindowMs = options.perfectWindowMs ?? DEFAULT_PERFECT_WINDOW_MS;
    if (
      !Number.isInteger(toleranceWindowMs) ||
      toleranceWindowMs < 0 ||
      !Number.isInteger(perfectWindowMs) ||
      perfectWindowMs < 0 ||
      perfectWindowMs > toleranceWindowMs
    ) {
      throw new RangeError('Scoring windows must be integers with 0 <= perfect <= tolerance');
    }
    this.toleranceWindowMs = toleranceWindowMs;
    this.perfectWindowMs = perfectWindowMs;
    this.maxLateWindowMs = toleranceWindowMs;
  }

  scheduleExpectedNotes(notes: readonly ExpectedPracticeNote[]): void {
    this.assertOpen();
    const incoming = notes.map((note, index) => this.normalizeExpectedNote(note, this.nextOrder + index));
    if (incoming.length === 0) return;
    for (const note of incoming) this.maxLateWindowMs = Math.max(this.maxLateWindowMs, note.lateWindowMs);

    incoming.sort(compareScheduledNotes);
    const active = this.pending.slice(this.pendingStart).filter((note) => !this.consumed.has(note.order));
    this.pending = this.merge(active, incoming);
    this.pendingStart = 0;
    this.consumed.clear();
    this.nextOrder += incoming.length;
  }

  play(note: PlayedPracticeNote): PracticeNoteEvent[] {
    this.assertOpen();
    const playedMidi = normalizeMidi(note.midi);
    const playedMs = normalizeTime(note.playedMs, true);
    if (note.hand != null && !isStudioHand(note.hand)) {
      throw new RangeError('Hand must be LEFT or RIGHT');
    }

    const events = this.advanceTo(playedMs);
    const matchIndex = this.closestExpectedNote(playedMidi, note.hand ?? null, playedMs, true);
    if (matchIndex >= 0) {
      const expected = this.pending[matchIndex];
      this.consumed.add(expected.order);
      const deltaMs = playedMs - expected.expectedMs;
      const absoluteDelta = Math.abs(deltaMs);
      const result = absoluteDelta <= this.perfectWindowMs ? 'PERFECT' : deltaMs < 0 ? 'EARLY' : 'LATE';
      events.push(
        this.createEvent({
          noteId: expected.noteId,
          measure: expected.measure,
          hand: expected.hand ?? note.hand ?? null,
          expectedMidi: expected.midi,
          playedMidi,
          expectedMs: expected.expectedMs,
          playedMs,
          deltaMs,
          result,
        }),
      );
      this.pruneConsumedPrefix();
      return events;
    }

    // Gắn nốt sai vào nốt chuẩn gần nhất để báo cáo theo ô nhịp đếm được (ST-01); nốt đó vẫn chờ người chơi đánh đúng
    const nearbyIndex = this.closestExpectedNote(playedMidi, null, playedMs, false);
    const nearby = nearbyIndex < 0 ? null : this.pending[nearbyIndex];
    events.push(
      this.createEvent({
        noteId: nearby?.noteId ?? null,
        measure: nearby?.measure ?? null,
        hand: nearby?.hand ?? note.hand ?? null,
        expectedMidi: null,
        playedMidi,
        expectedMs: null,
        playedMs,
        deltaMs: null,
        result: 'WRONG_PITCH',
      }),
    );
    return events;
  }

  advanceTo(timeMs: number): PracticeNoteEvent[] {
    this.assertOpen();
    const now = normalizeTime(timeMs, true);
    if (this.currentTimeMs !== null && now < this.currentTimeMs) {
      throw new RangeError('Scoring time must be monotonic');
    }
    this.currentTimeMs = now;

    const events: PracticeNoteEvent[] = [];
    while (this.pendingStart < this.pending.length) {
      const expected = this.pending[this.pendingStart];
      if (this.consumed.delete(expected.order)) {
        this.pendingStart += 1;
      } else if (expected.expectedMs + expected.lateWindowMs < now) {
        this.pendingStart += 1;
        events.push(this.missedEvent(expected));
      } else {
        break;
      }
    }
    this.compactIfNeeded();
    return events;
  }

  finish(coveredUntilMs: number): PracticeNoteEvent[] {
    this.assertOpen();
    const coveredUntil = normalizeTime(coveredUntilMs, true);
    if (this.currentTimeMs !== null && coveredUntil < this.currentTimeMs) {
      throw new RangeError('Finish time cannot precede the last scored time');
    }

    const events = this.advanceTo(coveredUntil);
    for (let index = this.pendingStart; index < this.pending.length; index += 1) {
      const expected = this.pending[index];
      if (!this.consumed.has(expected.order) && expected.expectedMs <= coveredUntil) {
        events.push(this.missedEvent(expected));
      }
    }
    this.pending = [];
    this.pendingStart = 0;
    this.consumed.clear();
    this.finished = true;
    return events;
  }

  private normalizeExpectedNote(note: ExpectedPracticeNote, order: number): ScheduledNote {
    if (
      !note ||
      typeof note.noteId !== 'string' ||
      note.noteId.trim().length === 0 ||
      !Number.isInteger(note.measure) ||
      note.measure < 1 ||
      (note.hand != null && !isStudioHand(note.hand))
    ) {
      throw new TypeError('Expected note metadata is invalid');
    }
    return {
      noteId: note.noteId,
      measure: note.measure,
      hand: note.hand ?? null,
      midi: normalizeMidi(note.midi),
      expectedMs: normalizeTime(note.expectedMs, false),
      durationMs: note.durationMs,
      order,
      lateWindowMs: Math.max(
        this.toleranceWindowMs,
        Math.min(MAX_LATE_WINDOW_MS, Math.round((note.durationMs ?? 0) / 2)),
      ),
    };
  }

  private closestExpectedNote(
    midi: number,
    hand: StudioHand | null,
    playedMs: number,
    requireMatchingPitch: boolean,
  ): number {
    const earliest = playedMs - this.maxLateWindowMs;
    const latest = playedMs + this.toleranceWindowMs;
    let low = this.pendingStart;
    let high = this.pending.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.pending[middle].expectedMs < earliest) low = middle + 1;
      else high = middle;
    }

    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let index = low; index < this.pending.length && this.pending[index].expectedMs <= latest; index += 1) {
      const expected = this.pending[index];
      if (
        this.consumed.has(expected.order) ||
        playedMs > expected.expectedMs + expected.lateWindowMs ||
        (requireMatchingPitch &&
          (expected.midi !== midi || (hand !== null && expected.hand !== null && expected.hand !== hand)))
      ) {
        continue;
      }
      const delta = Math.abs(playedMs - expected.expectedMs);
      if (delta < bestDelta || (delta === bestDelta && expected.order < this.pending[bestIndex]?.order)) {
        bestIndex = index;
        bestDelta = delta;
      }
    }
    return bestIndex;
  }

  private missedEvent(expected: ScheduledNote): PracticeNoteEvent {
    return this.createEvent({
      noteId: expected.noteId,
      measure: expected.measure,
      hand: expected.hand,
      expectedMidi: expected.midi,
      playedMidi: null,
      expectedMs: expected.expectedMs,
      playedMs: null,
      deltaMs: null,
      result: 'MISSED',
    });
  }

  private createEvent(event: Omit<PracticeNoteEvent, 'seq'>): PracticeNoteEvent {
    return { seq: this.nextSeq++, ...event };
  }

  private merge(existing: ScheduledNote[], incoming: ScheduledNote[]): ScheduledNote[] {
    const merged: ScheduledNote[] = [];
    let existingIndex = 0;
    let incomingIndex = 0;
    while (existingIndex < existing.length && incomingIndex < incoming.length) {
      if (compareScheduledNotes(existing[existingIndex], incoming[incomingIndex]) <= 0) {
        merged.push(existing[existingIndex++]);
      } else {
        merged.push(incoming[incomingIndex++]);
      }
    }
    return merged.concat(existing.slice(existingIndex), incoming.slice(incomingIndex));
  }

  private pruneConsumedPrefix(): void {
    while (this.pendingStart < this.pending.length && this.consumed.delete(this.pending[this.pendingStart].order)) {
      this.pendingStart += 1;
    }
    this.compactIfNeeded();
  }

  private compactIfNeeded(): void {
    if (this.pendingStart > 256 && this.pendingStart * 2 >= this.pending.length) {
      this.pending = this.pending.slice(this.pendingStart);
      this.pendingStart = 0;
    }
  }

  private assertOpen(): void {
    if (this.finished) {
      throw new Error('Scoring session is already finished');
    }
  }
}
